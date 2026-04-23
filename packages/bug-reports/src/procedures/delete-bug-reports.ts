import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import { ORPCError } from "@orpc/server"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  removeArtifactEventually,
  removeCaptureArtifactEventually,
  runArtifactCleanupPass,
} from "../lib/storage"
import { protectedProcedure } from "./context"
import { canManageBugReport, requireActiveOrgMember } from "./helpers"

export const deleteBugReport = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const activeMember = await requireActiveOrgMember(context.session)

    const report = await db.query.bugReport.findFirst({
      where: and(
        eq(bugReport.id, input.id),
        eq(bugReport.organizationId, activeMember.organizationId)
      ),
      columns: {
        id: true,
        reporterId: true,
        captureKey: true,
        debuggerKey: true,
        thumbnailKey: true,
      },
    })

    if (!report) {
      throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
    }

    if (
      !canManageBugReport({
        reporterId: report.reporterId,
        viewerRole: activeMember.role,
        viewerUserId: context.session.user.id,
      })
    ) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "Only the report creator or organization admins/owners can manage this bug report.",
      })
    }

    await db
      .delete(bugReport)
      .where(
        and(
          eq(bugReport.id, input.id),
          eq(bugReport.organizationId, activeMember.organizationId)
        )
      )

    if (report.captureKey) {
      await removeCaptureArtifactEventually(report.captureKey)
    }
    if (report.debuggerKey) {
      await removeArtifactEventually({
        artifactKind: "debugger",
        objectKey: report.debuggerKey,
      })
    }
    if (report.thumbnailKey) {
      await removeArtifactEventually({
        artifactKind: "thumbnail",
        objectKey: report.thumbnailKey,
      })
    }

    await runArtifactCleanupPass({ limit: 10 })

    return { id: input.id }
  })

export const deleteBugReportsBulk = protectedProcedure
  .input(
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(200),
    })
  )
  .handler(async ({ context, input }) => {
    const activeMember = await requireActiveOrgMember(context.session)
    const uniqueIds = Array.from(new Set(input.ids))

    const reports = await db.query.bugReport.findMany({
      where: and(
        eq(bugReport.organizationId, activeMember.organizationId),
        inArray(bugReport.id, uniqueIds)
      ),
      columns: {
        id: true,
        reporterId: true,
        captureKey: true,
        debuggerKey: true,
        thumbnailKey: true,
      },
    })

    if (reports.length === 0) {
      return { deletedCount: 0 }
    }

    const hasUnmanageableReport = reports.some(
      (report) =>
        !canManageBugReport({
          reporterId: report.reporterId,
          viewerRole: activeMember.role,
          viewerUserId: context.session.user.id,
        })
    )

    if (hasUnmanageableReport) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "Only report creators or organization admins/owners can manage the selected bug reports.",
      })
    }

    const captureKeys = reports
      .map((report) => report.captureKey)
      .filter((value): value is string => typeof value === "string")

    await db.delete(bugReport).where(
      and(
        eq(bugReport.organizationId, activeMember.organizationId),
        inArray(
          bugReport.id,
          reports.map((report) => report.id)
        )
      )
    )

    for (const objectKey of captureKeys) {
      await removeCaptureArtifactEventually(objectKey)
    }

    for (const report of reports) {
      if (report.debuggerKey) {
        await removeArtifactEventually({
          artifactKind: "debugger",
          objectKey: report.debuggerKey,
        })
      }

      if (report.thumbnailKey) {
        await removeArtifactEventually({
          artifactKind: "thumbnail",
          objectKey: report.thumbnailKey,
        })
      }
    }

    await runArtifactCleanupPass({ limit: 20 })

    return { deletedCount: reports.length }
  })
