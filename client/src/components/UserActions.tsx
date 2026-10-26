import { useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { User } from '@/lib/user-directory'
import { toast } from '@/lib/toast'

export interface UserDirectoryMeta {
  onEdit: (user: User) => void
  onDelete: (id: string, trigger?: HTMLElement) => void
  onToggleStatus: (user: User) => void
  onSendSetupLink: (user: User) => void
  onViewDetails: (user: User, trigger?: HTMLElement) => void
  onInspect?: (user: User) => void
  canManageUser: (user: User) => boolean
  pendingUserActions: Record<string, string>
  actionsDisabled: boolean
}
export function UserActions({ user, meta }: { user: User; meta: UserDirectoryMeta }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const pending = meta.pendingUserActions[user._id]
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button ref={trigger} variant="ghost" className="h-11 w-11 p-0" disabled={meta.actionsDisabled || Boolean(pending)}>
        <span className="sr-only">Actions for {user.name}</span><MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="rounded-xl border-gray-200 bg-white p-1.5 shadow-lg motion-reduce:animate-none">
      <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => meta.onViewDetails(user, trigger.current || undefined)}>View user details</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => {
        void navigator.clipboard.writeText(user._id).then(() => toast.success('User ID copied')).catch(() => toast.error('Unable to copy user ID'))
      }}>Copy ID</DropdownMenuItem>
      {meta.onInspect && user.status === 'Active' && user.role !== 'SuperAdmin' && <DropdownMenuItem onSelect={() => meta.onInspect?.(user)}>Inspect as user (read-only)</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {meta.canManageUser(user) ? <>
        <DropdownMenuItem onSelect={() => meta.onEdit(user)}>Edit details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => meta.onToggleStatus(user)}>{user.status === 'Active' ? 'Suspend access' : 'Restore access'}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => meta.onSendSetupLink(user)}>{!user.invitationSentAt ? 'Send invite link' : ['Invited', 'ResetPending'].includes(user.lifecycleStatus?.code || '') ? 'Resend invite link' : 'Send reset link'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => meta.onDelete(user._id, trigger.current || undefined)} className="text-red-700 focus:text-red-700">Delete user</DropdownMenuItem>
      </> : <DropdownMenuItem disabled>Outside your governance scope</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>
}
