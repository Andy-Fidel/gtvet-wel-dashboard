
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type User = {
    _id: string
    name: string
    email: string
    role: 'SuperAdmin' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner' | 'Guardian'
    status: 'Active' | 'Inactive'
    lifecycleStatus?: {
      code: 'Invited' | 'ResetPending' | 'PasswordChangeRequired' | 'Active' | 'Inactive'
      label: string
    }
    passwordChangeRequired?: boolean
    phone?: string
    institution?: string
    region?: string
    effectiveRegion?: string
    partnerId?: { _id: string, name: string }
    linkedLearners?: Array<{ _id: string; name: string; trackingId?: string; institution?: string }>
    invitationSentAt?: string
    inviteAcceptedAt?: string
    lastLoginAt?: string
    resetPasswordExpires?: string
    workloadSummary?: {
      learnersOwned: number
      activePlacementsOwned: number
    }
    auditSummary?: {
      createdBy?: {
        actorName: string
        actorRole: string
        createdAt: string
      } | null
      lastRoleChange?: {
        actorName: string
        actorRole: string
        createdAt: string
      } | null
      lastLoginAt?: string | null
      failedLoginCount: number
      recentSensitiveActions: Array<{
        _id: string
        action: string
        summary: string
        actorName: string
        actorRole: string
        changedFields: string[]
        createdAt: string
      }>
    }
    createdAt: string
}

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "institution",
    header: "Scope (Inst / Region)",
    cell: ({ row }) => {
        const inst = row.original.institution
        const role = row.original.role
        const region = row.original.region
        const partner = row.original.partnerId
        const linkedLearners = row.original.linkedLearners || []
        
        if (role === 'RegionalAdmin') return `Region: ${region || 'N/A'}`
        if (role === 'IndustryPartner') return `Partner: ${partner?.name || 'N/A'}`
        if (role === 'Guardian') return `${linkedLearners.length} learner${linkedLearners.length === 1 ? '' : 's'} linked`
        return inst || "N/A"
    }
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
        const role = row.getValue("role") as string
        let color = "bg-slate-500 hover:bg-slate-600"
        if (role === 'Admin') color = "bg-purple-500 hover:bg-purple-600"
        if (role === 'Manager') color = "bg-blue-500 hover:bg-blue-600"
        if (role === 'IndustryPartner') color = "bg-orange-500 hover:bg-orange-600"
        if (role === 'Guardian') color = "bg-teal-500 hover:bg-teal-600"
        
        return <Badge className={`${color} text-white border-0`}>{role}</Badge>
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as string
        let color = "bg-slate-500 hover:bg-slate-600"
        if (status === 'Active') color = "bg-green-500 hover:bg-green-600"
        if (status === 'Inactive') color = "bg-red-500 hover:bg-red-600"
        
        return <Badge className={`${color} text-white border-0`}>{status}</Badge>
    }
  },
  {
    id: "lifecycle",
    header: "Lifecycle",
    cell: ({ row }) => {
      const lifecycle = row.original.lifecycleStatus
      const code = lifecycle?.code || "Active"
      const label = lifecycle?.label || "Active"
      const colorMap: Record<string, string> = {
        Invited: "bg-amber-100 text-amber-800 border-amber-200",
        ResetPending: "bg-sky-100 text-sky-800 border-sky-200",
        PasswordChangeRequired: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
        Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
        Inactive: "bg-slate-100 text-slate-700 border-slate-200",
      }

      return (
        <div className="space-y-1">
          <Badge className={`border ${colorMap[code] || colorMap.Active}`}>{label}</Badge>
          {row.original.invitationSentAt ? (
            <p className="text-[11px] text-gray-500">
              Invite sent {new Date(row.original.invitationSentAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      )
    },
  },
  {
    id: "accessVisibility",
    header: "Access Visibility",
    cell: ({ row }) => (
      <div className="space-y-1 text-xs">
        <p className="font-medium text-gray-700">
          {row.original.lastLoginAt ? `Last login: ${new Date(row.original.lastLoginAt).toLocaleString()}` : "No successful login yet"}
        </p>
        <p className="text-gray-500">
          {row.original.resetPasswordExpires
            ? `Reset link expires ${new Date(row.original.resetPasswordExpires).toLocaleString()}`
            : row.original.passwordChangeRequired
              ? "Password setup still required"
              : "Password setup complete"}
        </p>
      </div>
    ),
  },
  {
    id: "auditVisibility",
    header: "Audit Visibility",
    cell: ({ row }) => {
      const audit = row.original.auditSummary
      return (
        <div className="space-y-1 text-xs">
          <p className="font-medium text-gray-700">
            Created by: {audit?.createdBy ? `${audit.createdBy.actorName} (${audit.createdBy.actorRole})` : "Not recorded"}
          </p>
          <p className="text-gray-500">
            Last role change: {audit?.lastRoleChange ? `${audit.lastRoleChange.actorName} · ${new Date(audit.lastRoleChange.createdAt).toLocaleDateString()}` : "No role change recorded"}
          </p>
          <p className="text-gray-500">
            Failed logins: {audit?.failedLoginCount ?? 0}
          </p>
        </div>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const user = row.original
      const meta = table.options.meta as { 
        onEdit: (user: User) => void, 
        onDelete: (id: string) => void,
        onToggleStatus: (user: User) => void,
        onSendSetupLink?: (user: User) => void,
        onViewAudit?: (user: User) => void,
        canManageUser?: (user: User) => boolean,
      }
      const canManageUser = meta?.canManageUser ? meta.canManageUser(user) : true
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl border-white/70 bg-white/90 backdrop-blur-xl shadow-2xl p-2">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user._id)}>
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {canManageUser ? (
              <>
                <DropdownMenuItem onClick={() => meta?.onEdit(user)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onToggleStatus(user)}>
                    Mark as {user.status === 'Active' ? 'Inactive' : 'Active'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onSendSetupLink?.(user)}>
                    {!user.invitationSentAt
                      ? 'Send invite link'
                      : user.lifecycleStatus?.code === 'Invited' || user.lifecycleStatus?.code === 'ResetPending'
                        ? 'Resend invite link'
                        : 'Send reset link'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onViewAudit?.(user)}>
                    View audit activity
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(user._id)} className="text-red-600 focus:text-red-600">Delete User</DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem disabled>
                Outside your governance scope
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
