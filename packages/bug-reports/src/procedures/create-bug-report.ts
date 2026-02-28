import {
  createBugReportInputSchema,
  createBugReportRecord,
} from "../lib/create-bug-report"
import { protectedProcedure } from "./context"
import { normalizeTags, requireActiveOrgId } from "./helpers"

export const createBugReport = protectedProcedure
  .input(createBugReportInputSchema)
  .handler(({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)

    return createBugReportRecord({
      input,
      organizationId: activeOrgId,
      reporterId: context.session.user.id,
      tags: normalizeTags(input.tags),
    })
  })
