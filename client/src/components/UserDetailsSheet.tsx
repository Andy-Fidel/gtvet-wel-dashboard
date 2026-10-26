import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { auditTimestamp } from '@/lib/audit-log'
import { userRoleLabel, userScope, userSetupLabel, type User } from '@/lib/user-directory'

export function UserDetailsSheet({ user, onClose, onRestoreFocus }: { user: User | null; onClose: () => void; onRestoreFocus: () => void }) {
  const audit = user?.auditSummary
  return <Sheet open={Boolean(user)} onOpenChange={open => { if (!open) onClose() }}>
    <SheetContent className="w-full overflow-y-auto bg-white sm:max-w-xl data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-out motion-reduce:animate-none [&>button]:min-h-11 [&>button]:min-w-11" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus() }}>
      {user && <div className="space-y-6">
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>{user.name}</SheetTitle><SheetDescription className="break-all">{user.email}</SheetDescription>
        </SheetHeader>
        <section aria-label="Account access" className="space-y-3 rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold">Account access</h3>
          <Badge className={user.status === 'Active' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-100 text-gray-700'}>{user.status === 'Active' ? 'Access enabled' : 'Access suspended'}</Badge>
          <dl className="space-y-3 text-sm">
            {[
              ['Role', userRoleLabel(user.role)], ['Scope', userScope(user)], ['Setup', userSetupLabel(user)],
              ['Phone', user.phone || 'Not recorded'],
              ['Last sign-in (UTC)', user.lastLoginAt ? auditTimestamp(user.lastLoginAt) : 'No successful login recorded'],
              ['Invitation sent (UTC)', user.invitationSentAt ? auditTimestamp(user.invitationSentAt) : 'Not recorded'],
              ['Invitation delivery', user.invitationDeliveryStatus || 'Not recorded'],
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 break-words text-gray-900">{value}</dd></div>)}
          </dl>
          {user.invitationDeliveryStatus === 'failed' && <p className="text-sm text-red-700">The setup email failed. Use the account actions to resend the link.</p>}
        </section>
        <section aria-label="Account history" className="space-y-4">
          <h3 className="font-semibold">Account history</h3>
          <dl className="grid gap-4 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-gray-500">Created by</dt><dd className="mt-1">{audit?.createdBy ? `${audit.createdBy.actorName} (${audit.createdBy.actorRole})` : 'Not recorded'}</dd>{audit?.createdBy?.createdAt && <dd className="mt-1 text-xs text-gray-500">{auditTimestamp(audit.createdBy.createdAt)}</dd>}</div>
            <div><dt className="text-xs text-gray-500">Last role change</dt><dd className="mt-1">{audit?.lastRoleChange ? `${audit.lastRoleChange.actorName} (${audit.lastRoleChange.actorRole})` : 'No role change recorded'}</dd>{audit?.lastRoleChange?.createdAt && <dd className="mt-1 text-xs text-gray-500">{auditTimestamp(audit.lastRoleChange.createdAt)}</dd>}</div>
            <div><dt className="text-xs text-gray-500">Failed logins</dt><dd className="mt-1 font-semibold tabular-nums">{audit?.failedLoginCount ?? 0}</dd></div>
          </dl>
        </section>
        <section aria-label="Recent sensitive actions" className="space-y-3">
          <h3 className="font-semibold">Recent sensitive actions</h3>
          {audit?.recentSensitiveActions?.length ? audit.recentSensitiveActions.map(action => <article key={action._id} className="space-y-2 rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium">{action.summary}</p><p className="text-xs text-gray-500">{action.actorName} ({action.actorRole}) · {auditTimestamp(action.createdAt)}</p>
            <div className="flex flex-wrap gap-1">{action.changedFields?.map(field => <Badge key={field} className="border-gray-200 bg-gray-50 text-gray-600">{field}</Badge>)}</div>
          </article>) : <p className="text-sm text-gray-500">No recent sensitive actions recorded for this account.</p>}
        </section>
      </div>}
    </SheetContent>
  </Sheet>
}
