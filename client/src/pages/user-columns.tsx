import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserActions, type UserDirectoryMeta } from '@/components/UserActions'
import { userRoleLabel, userScope, userSetupLabel, type User } from '@/lib/user-directory'
import { auditTimestamp } from '@/lib/audit-log'
export type { User } from '@/lib/user-directory'


export const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    meta: { label: 'User', exportValue: (user: User) => `${user.name} <${user.email}>` },
    header: ({ column }) => <Button variant="ghost" className="-ml-3" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>User<ArrowUpDown aria-hidden="true" className="ml-2 h-4 w-4" /></Button>,
    cell: ({ row, table }) => {
      const user = row.original
      const meta = table.options.meta as UserDirectoryMeta
      return <div className="space-y-1">
        <button type="button" className="text-left font-semibold text-gray-900 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2" onClick={event => meta.onViewDetails(user, event.currentTarget)}>{user.name}</button>
        <p className="break-all text-xs font-normal text-gray-500">{user.email}</p>
        {meta.pendingUserActions[user._id] && <p role="status" className="text-xs font-medium text-amber-800">{meta.pendingUserActions[user._id]}</p>}
      </div>
    },
  },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'role', header: 'Role', meta: { exportValue: (user: User) => userRoleLabel(user.role) },
    cell: ({ row }) => <div className="space-y-1"><Badge className="border-gray-200 bg-gray-50 text-gray-700">{userRoleLabel(row.original.role)}</Badge>{row.original.role === 'IndustryPartner' && <p className="text-xs text-gray-500">{row.original.partnerPortalRole || 'Coordinator'}</p>}</div>,
  },
  { accessorKey: 'institution', header: 'Access scope', meta: { exportValue: userScope }, cell: ({ row }) => <span className="text-sm text-gray-600">{userScope(row.original)}</span> },
  {
    accessorKey: 'status', header: 'Account state',
    meta: { exportValue: (user: User) => `${user.status === 'Active' ? 'Access enabled' : 'Access suspended'}; ${userSetupLabel(user)}` },
    cell: ({ row }) => <div className="space-y-1.5"><Badge className={row.original.status === 'Active' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-100 text-gray-700'}>{row.original.status === 'Active' ? 'Access enabled' : 'Access suspended'}</Badge><p className="text-xs text-gray-600">{userSetupLabel(row.original)}</p>{row.original.invitationDeliveryStatus === 'failed' && <p className="text-xs font-medium text-red-700">Setup email failed. Resend the link.</p>}</div>,
  },
  {
    id: 'accessVisibility', header: 'Last sign-in',
    meta: { exportValue: (user: User) => user.lastLoginAt ? auditTimestamp(user.lastLoginAt) : 'No successful login recorded' },
    cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.lastLoginAt ? auditTimestamp(row.original.lastLoginAt) : 'No successful login recorded'}</span>,
  },
  {
    id: 'auditVisibility', header: 'Audit summary',
    meta: { exportValue: (user: User) => `Created by: ${user.auditSummary?.createdBy?.actorName || 'Not recorded'}; Failed logins: ${user.auditSummary?.failedLoginCount ?? 0}` },
    cell: ({ row }) => <span className="text-xs text-gray-500">Created by {row.original.auditSummary?.createdBy?.actorName || 'Not recorded'} · {row.original.auditSummary?.failedLoginCount ?? 0} failed logins</span>,
  },
  { id: 'actions', enableHiding: false, cell: ({ row, table }) => <UserActions user={row.original} meta={table.options.meta as UserDirectoryMeta} /> },
]
