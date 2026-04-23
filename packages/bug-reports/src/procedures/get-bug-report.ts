import { db } from "@crikket/db"
import { member } from "@crikket/db/schema/auth"
import { bugReport } from "@crikket/db/schema/bug-report"
import {
  PRIORITY_OPTIONS,
  type Priority,
} from "@crikket/shared/constants/priorities"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { resolveCaptureUrl } from "../lib/storage"
import {
  assertBugReportAccessById,
  assertVisibilityAccess,
  bugReportIdInputSchema,
  isStatus,
  statusValues,
} from "../lib/utils"
import { o } from "./context"
import { canManageBugReport } from "./helpers"

const priorityValues = Object.values(PRIORITY_OPTIONS) as [
  Priority,
  ...Priority[],
]

export const getBugReportById = o
  .input(bugReportIdInputSchema)
  .handler(async ({ context, input }) => {
    await assertBugReportAccessById({
      id: input.id,
      session: context.session,
    })

    const report = await db.query.bugReport.findFirst({
      where: eq(bugReport.id, input.id),
      with: {
        reporter: true,
        organization: true,
      },
    })

    if (!report) {
      throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
    }

    const visibility = assertVisibilityAccess({
      organizationId: report.organizationId,
      session: context.session,
      visibility: report.visibility,
    })
    const activeOrgId = context.session?.session.activeOrganizationId
    let canEdit = false

    if (context.session?.user && activeOrgId === report.organizationId) {
      const activeMember = await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, activeOrgId),
          eq(member.userId, context.session.user.id)
        ),
        columns: {
          role: true,
        },
      })

      if (activeMember) {
        canEdit = canManageBugReport({
          reporterId: report.reporterId,
          viewerRole: activeMember.role,
          viewerUserId: context.session.user.id,
        })
      }
    }

    const status = isStatus(report.status) ? report.status : statusValues[0]
    const priority = priorityValues.includes(report.priority as Priority)
      ? (report.priority as Priority)
      : PRIORITY_OPTIONS.none
    const attachmentUrl = await resolveCaptureUrl({
      captureKey: report.captureKey,
    })

    return {
      id: report.id,
      title: report.title,
      description: report.description,
      status,
      priority,
      tags: Array.isArray(report.tags) ? report.tags : [],
      url: report.url,
      attachmentUrl,
      attachmentType: report.attachmentType,
      submissionStatus: report.submissionStatus,
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      debuggerIngestionError: report.debuggerIngestionError,
      visibility,
      canEdit,
      deviceInfo: report.deviceInfo,
      metadata: report.metadata,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      reporter: report.reporter
        ? {
            name: report.reporter.name,
            image: report.reporter.image,
          }
        : null,
      organization: {
        name: report.organization.name,
        logo: report.organization.logo,
      },
    }
  })
