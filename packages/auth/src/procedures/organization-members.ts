import { assertOrganizationCanAddMembers } from "@crikket/billing/service/entitlements/organization-entitlements"
import { db } from "@crikket/db"
import * as authSchema from "@crikket/db/schema/auth"
import { ORPCError } from "@orpc/server"
import { APIError } from "better-auth/api"
import { and, eq, ilike } from "drizzle-orm"
import { z } from "zod"

import { auth } from "../index"
import { protectedProcedure } from "./context"

const addOrganizationMemberDirectInputSchema = z.object({
  email: z.email("Enter a valid email address"),
  organizationId: z.string().min(1),
  role: z.enum(["admin", "member"]),
})

function isOrganizationManagerRole(role: string): boolean {
  return role === "owner" || role === "admin"
}

export const addOrganizationMemberDirectProcedure = protectedProcedure
  .input(addOrganizationMemberDirectInputSchema)
  .handler(async ({ context, input }) => {
    const normalizedEmail = input.email.toLowerCase()

    const actorMembership = await db.query.member.findFirst({
      where: and(
        eq(authSchema.member.organizationId, input.organizationId),
        eq(authSchema.member.userId, context.session.user.id)
      ),
      columns: {
        role: true,
      },
    })

    if (!(actorMembership && isOrganizationManagerRole(actorMembership.role))) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only organization admins or owners can add members directly.",
      })
    }

    await assertOrganizationCanAddMembers(input.organizationId)

    const existingUser = await db.query.user.findFirst({
      where: ilike(authSchema.user.email, normalizedEmail),
      columns: {
        email: true,
        id: true,
        name: true,
      },
    })

    if (!existingUser) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "No existing account was found for that email. Send an invitation instead.",
      })
    }

    const existingMembership = await db.query.member.findFirst({
      where: and(
        eq(authSchema.member.organizationId, input.organizationId),
        eq(authSchema.member.userId, existingUser.id)
      ),
      columns: {
        id: true,
      },
    })

    if (existingMembership) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That user is already a member of this organization.",
      })
    }

    try {
      const addedMember = await auth.api.addMember({
        body: {
          organizationId: input.organizationId,
          role: input.role,
          userId: existingUser.id,
        },
      })

      const canceledInvitations = await db
        .update(authSchema.invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(authSchema.invitation.organizationId, input.organizationId),
            eq(authSchema.invitation.email, normalizedEmail),
            eq(authSchema.invitation.status, "pending")
          )
        )
        .returning({ id: authSchema.invitation.id })

      return {
        canceledInvitationCount: canceledInvitations.length,
        email: existingUser.email,
        id: addedMember.id,
        name: existingUser.name,
        role: addedMember.role,
        userId: existingUser.id,
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw new ORPCError("BAD_REQUEST", {
          message: error.message,
          cause: error,
        })
      }

      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to add member directly. Please try again.",
        cause: error,
      })
    }
  })
