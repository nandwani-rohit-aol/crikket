import { db } from "@crikket/db"
import { member } from "@crikket/db/schema/auth"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"

import type { SessionContext } from "../lib/utils"

export function requireActiveOrgId(session: SessionContext): string {
  const activeOrgId = session.session.activeOrganizationId
  if (!activeOrgId) {
    throw new ORPCError("BAD_REQUEST", { message: "No active organization" })
  }

  return activeOrgId
}

export async function requireActiveOrgMember(
  session: SessionContext
): Promise<{ organizationId: string; role: string }> {
  const activeOrgId = requireActiveOrgId(session)

  const activeMember = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, activeOrgId),
      eq(member.userId, session.user.id)
    ),
    columns: {
      role: true,
    },
  })

  if (!activeMember) {
    throw new ORPCError("FORBIDDEN", {
      message: "You are not a member of the active organization.",
    })
  }

  return {
    organizationId: activeOrgId,
    role: activeMember.role,
  }
}

export async function requireActiveOrgAdmin(
  session: SessionContext
): Promise<string> {
  const activeMember = await requireActiveOrgMember(session)

  if (!isOrgAdminRole(activeMember.role)) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Only organization admins or owners can manage capture widget keys.",
    })
  }

  return activeMember.organizationId
}

export function isOrgAdminRole(role: string): boolean {
  return role === "owner" || role === "admin"
}

export function canManageBugReport(input: {
  reporterId?: string | null
  viewerRole: string
  viewerUserId: string
}): boolean {
  return (
    input.reporterId === input.viewerUserId || isOrgAdminRole(input.viewerRole)
  )
}

export function normalizeTags(tags?: string[]): string[] | undefined {
  if (!tags) {
    return undefined
  }

  const uniqueTags = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 40))
    )
  )

  return uniqueTags.length > 0 ? uniqueTags : []
}
