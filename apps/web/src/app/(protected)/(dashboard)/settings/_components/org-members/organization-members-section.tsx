"use client"

import { authClient } from "@crikket/auth/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "nextjs-toploader/app"
import { toast } from "sonner"

import { client } from "@/utils/orpc"
import { InviteMemberForm } from "./invite-member-form"
import { MembersTable } from "./members-table"
import { PendingInvitations } from "./pending-invitations"
import type {
  OrganizationInvitationRow,
  OrganizationMemberRow,
  OrganizationRole,
} from "./types"

interface OrganizationMembersSectionProps {
  organizationId: string
  currentPlan: "free" | "pro" | "studio"
  currentUserId: string
  currentUserRole: OrganizationRole
  memberCap: number | null
  members: OrganizationMemberRow[]
  totalMembers: number
  pendingInvitations: OrganizationInvitationRow[]
}

function canManageMembers(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin"
}

function getErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string
): string {
  return error?.message ?? fallback
}

export function OrganizationMembersSection({
  organizationId,
  currentPlan,
  currentUserId,
  currentUserRole,
  memberCap,
  members,
  totalMembers,
  pendingInvitations,
}: OrganizationMembersSectionProps) {
  const router = useRouter()
  const canManage = canManageMembers(currentUserRole)
  const hasReachedMemberCap =
    typeof memberCap === "number" && totalMembers >= memberCap
  const canInviteMembers = canManage && !hasReachedMemberCap

  const inviteMemberMutation = useMutation({
    mutationFn: async (input: { email: string; role: "admin" | "member" }) => {
      const { error } = await authClient.organization.inviteMember({
        organizationId,
        email: input.email,
        role: input.role,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Invitation sent")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to invite member"))
    },
  })

  const addMemberDirectMutation = useMutation({
    mutationFn: async (input: { email: string; role: "admin" | "member" }) =>
      client.auth.addOrganizationMemberDirect({
        email: input.email,
        organizationId,
        role: input.role,
      }),
    onSuccess: (result) => {
      router.refresh()
      toast.success(
        result.canceledInvitationCount > 0
          ? "Member added directly and pending invitation canceled"
          : "Member added directly"
      )
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to add member directly"))
    },
  })

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (input: {
      memberId: string
      role: "admin" | "member"
    }) => {
      const { error } = await authClient.organization.updateMemberRole({
        organizationId,
        memberId: input.memberId,
        role: input.role,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Member role updated")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to update member role"))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await authClient.organization.removeMember({
        organizationId,
        memberIdOrEmail: memberId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Member removed")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to remove member"))
    },
  })

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Invitation canceled")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to cancel invitation"))
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Members</CardTitle>
          <CardDescription>
            Add existing teammates directly or send an invite when they have not
            signed up yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InviteMemberForm
            canInviteMembers={canInviteMembers}
            isAddingDirectly={addMemberDirectMutation.isPending}
            isInviting={inviteMemberMutation.isPending}
            onAddMemberDirectly={async (input) => {
              await addMemberDirectMutation.mutateAsync(input)
            }}
            onInviteMember={(input) => inviteMemberMutation.mutateAsync(input)}
          />
          {canManage ? null : (
            <p className="text-muted-foreground text-sm">
              Only organization admins and owners can manage members.
            </p>
          )}
          {hasReachedMemberCap ? (
            <p className="text-muted-foreground text-sm">
              {currentPlan === "pro"
                ? "Pro plan member limit reached. Upgrade to Studio to add more teammates."
                : "Member limit reached for this organization plan."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <MembersTable
        management={{
          canManageMembers: canManage,
          currentUserId,
          updatingMemberId: updateMemberRoleMutation.isPending
            ? (updateMemberRoleMutation.variables?.memberId ?? null)
            : null,
          removingMemberId: removeMemberMutation.isPending
            ? (removeMemberMutation.variables ?? null)
            : null,
          onUpdateMemberRole: (memberId, role) =>
            updateMemberRoleMutation.mutateAsync({ memberId, role }),
          onRemoveMember: (memberId) =>
            removeMemberMutation.mutateAsync(memberId),
        }}
        members={members}
        totalMembers={totalMembers}
      />

      <PendingInvitations
        cancelingInvitationId={
          cancelInvitationMutation.isPending
            ? (cancelInvitationMutation.variables ?? null)
            : null
        }
        canManageMembers={canManage}
        invitations={pendingInvitations}
        onCancelInvitation={(invitationId) =>
          cancelInvitationMutation.mutateAsync(invitationId)
        }
      />
    </div>
  )
}
