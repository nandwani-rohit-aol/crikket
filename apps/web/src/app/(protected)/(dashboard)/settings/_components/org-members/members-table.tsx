"use client"

import { paginationConfig } from "@crikket/shared/config/pagination"
import { DataTable } from "@crikket/ui/components/data-table/data-table"
import { ConfirmationDialog } from "@crikket/ui/components/dialogs/confirmation-dialog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import { Input } from "@crikket/ui/components/ui/input"
import { useDataTable } from "@crikket/ui/hooks/use-data-table"
import { useDebouncedCallback } from "@crikket/ui/hooks/use-debounced-callback"
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"
import * as React from "react"

import { createMembersTableColumns } from "./members-table-columns"
import type { OrganizationMemberRow } from "./types"

interface MembersTableProps {
  members: OrganizationMemberRow[]
  totalMembers: number
  management: {
    canManageMembers: boolean
    currentUserId: string
    updatingMemberId: string | null
    removingMemberId: string | null
    onUpdateMemberRole: (
      memberId: string,
      role: "admin" | "member"
    ) => Promise<void>
    onRemoveMember: (memberId: string) => Promise<void>
  }
}

export function MembersTable({
  members,
  totalMembers,
  management,
}: MembersTableProps) {
  const [memberIdToRemove, setMemberIdToRemove] = React.useState<string | null>(
    null
  )
  const [{ search, perPage }, setMembersSearchQuery] = useQueryStates(
    {
      search: parseAsString
        .withOptions({ clearOnDefault: true })
        .withDefault(""),
      page: parseAsInteger.withDefault(paginationConfig.defaultPage),
      perPage: parseAsInteger.withDefault(paginationConfig.defaultPageSize),
    },
    {
      shallow: false,
      history: "replace",
    }
  )
  const updateSearchQuery = useDebouncedCallback((value: string) => {
    setMembersSearchQuery({
      page: paginationConfig.defaultPage,
      search: value,
    }).catch(() => undefined)
  }, 500)

  const columns = React.useMemo(
    () =>
      createMembersTableColumns({
        canManageMembers: management.canManageMembers,
        currentUserId: management.currentUserId,
        removingMemberId: management.removingMemberId,
        updatingMemberId: management.updatingMemberId,
        onRequestRemove: setMemberIdToRemove,
        onUpdateMemberRole: management.onUpdateMemberRole,
      }),
    [
      management.canManageMembers,
      management.currentUserId,
      management.onUpdateMemberRole,
      management.removingMemberId,
      management.updatingMemberId,
    ]
  )
  const pageCount = Math.max(1, Math.ceil(totalMembers / Math.max(1, perPage)))
  const { table } = useDataTable({
    data: members,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: perPage,
      },
    },
    queryKeys: {
      page: "page",
      perPage: "perPage",
    },
    debounceMs: 0,
    history: "push",
    shallow: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          className="h-9 max-w-sm"
          defaultValue={search}
          key={search}
          onChange={(event) => {
            updateSearchQuery(event.target.value)
          }}
          placeholder="Search members by email"
        />
        <DataTable table={table} />
        <ConfirmationDialog
          confirmText="Remove member"
          description="This user will immediately lose access to the organization."
          isLoading={memberIdToRemove === management.removingMemberId}
          onConfirm={async () => {
            if (!memberIdToRemove) {
              return
            }

            await management.onRemoveMember(memberIdToRemove)
            setMemberIdToRemove(null)
          }}
          onOpenChange={(open) => {
            if (!open) {
              setMemberIdToRemove(null)
            }
          }}
          open={memberIdToRemove !== null}
          title="Remove member?"
          variant="destructive"
        />
      </CardContent>
    </Card>
  )
}
