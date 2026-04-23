import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { retryBugReportDebuggerIngestion } from "../lib/ingestion-jobs"
import {
  createBugReportUploadSession,
  createBugReportUploadSessionInputSchema,
  finalizeBugReportUpload,
  finalizeBugReportUploadInputSchema,
} from "../lib/upload-session"
import { protectedProcedure } from "./context"
import {
  canManageBugReport,
  normalizeTags,
  requireActiveOrgId,
  requireActiveOrgMember,
} from "./helpers"

export const createBugReportUpload = protectedProcedure
  .input(createBugReportUploadSessionInputSchema)
  .handler(({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)

    return createBugReportUploadSession({
      input,
      organizationId: activeOrgId,
      reporterId: context.session.user.id,
      tags: normalizeTags(input.tags),
    })
  })

export const finalizeBugReportUploadProcedure = protectedProcedure
  .input(finalizeBugReportUploadInputSchema)
  .handler(({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)

    return finalizeBugReportUpload({
      input,
      organizationId: activeOrgId,
    })
  })

export const retryBugReportDebuggerIngestionProcedure = protectedProcedure
  .input(
    z.object({
      id: z.string().min(1),
    })
  )
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

    const result = await retryBugReportDebuggerIngestion({
      bugReportId: input.id,
      organizationId: activeMember.organizationId,
    })

    const updatedReport = await db.query.bugReport.findFirst({
      where: and(
        eq(bugReport.id, input.id),
        eq(bugReport.organizationId, activeMember.organizationId)
      ),
      columns: {
        debuggerIngestionError: true,
        debuggerIngestionStatus: true,
        id: true,
        submissionStatus: true,
      },
    })

    if (!updatedReport) {
      throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
    }

    return {
      debugger: result.debugger,
      debuggerIngestionError: updatedReport.debuggerIngestionError,
      debuggerIngestionStatus: updatedReport.debuggerIngestionStatus,
      id: updatedReport.id,
      submissionStatus: updatedReport.submissionStatus,
    }
  })
