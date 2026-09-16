import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { MfaSettings } from '@/components/MfaSettings'

type Session = {
  _id: string
  current: boolean
  userId: { _id: string; name: string; email: string; role: string } | null
  ipAddress: string
  userAgent: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  parentSessionId?: string
}
type SessionPage = { sessions: Session[]; total: number; pageSize: number }

export function SecuritySessions() {
  const { user, authFetch } = useAuth()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState('mine')
  const [page, setPage] = useState(1)
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<{ path: string; label: string } | null>(null)
  const query = useQuery<SessionPage>({
    queryKey: ['security-sessions', user?._id, scope, page],
    queryFn: async ({ signal }) => {
      const response = await authFetch(`/api/auth/security/sessions?scope=${scope}&page=${page}`, { signal })
      if (!response.ok) throw new Error('Unable to load sessions. Please try again.')
      return response.json()
    },
    refetchInterval: 30000,
  })
  useEffect(() => {
    if (query.data && page > 1 && query.data.sessions.length === 0) setPage(1)
  }, [query.data, page])

  async function revoke(event: React.FormEvent) {
    event.preventDefault()
    if (!target || busy) return
    setBusy(true)
    try {
      const response = await authFetch(`/api/auth/security/${target.path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, reason }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to revoke sessions')
      toast.success(data.message)
      setTarget(null)
      setReason('')
      await queryClient.invalidateQueries({ queryKey: ['security-sessions'] })
      if (data.signedOut) window.location.assign('/login')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke sessions')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Security & Sessions</CardTitle>
      <CardDescription>Review sign-ins and revoke access. Password, role, scope, and account-status changes invalidate existing sessions. Device details are reported by the browser, not verified identities.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <MfaSettings />
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={scope === 'mine' ? 'default' : 'outline'} onClick={() => { setScope('mine'); setPage(1) }}>My sessions</Button>
        {user?.role === 'SuperAdmin' && <Button variant={scope === 'all' ? 'default' : 'outline'} onClick={() => { setScope('all'); setPage(1) }}>All users</Button>}
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button>
        <Button variant="destructive" disabled={busy} onClick={() => { setPassword(''); setTarget({ path: `users/${user?._id}/revoke-all`, label: 'Sign out all my sessions, including this one' }) }}>Sign out everywhere</Button>
      </div>
      {target && <form onSubmit={revoke} className="rounded-xl border p-4 space-y-3">
        <p className="font-semibold">Confirm: {target.label}</p>
        <p className="text-sm text-gray-500">Access ends on the next request. Unsaved work on affected devices may be lost.</p>
        <Label htmlFor="session-reason">Reason</Label>
        <Input id="session-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={500} required />
        <Label htmlFor="session-password">Your current password</Label>
        <Input id="session-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} />
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={busy}>{busy ? 'Revoking…' : 'Confirm sign-out'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setTarget(null); setPassword(''); setReason('') }}>Cancel</Button>
        </div>
      </form>}
      {query.isPending && <p role="status">Loading sessions…</p>}
      {query.isError && <p role="alert" className="text-red-700">{query.error.message}</p>}
      {query.data && <>
        <p className="text-sm text-gray-500">{query.data.total} unexpired, non-revoked sessions. Sessions invalidated by account changes may remain listed until expiry.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead><tr>{['Account', 'Device / IP', 'Signed in', 'Last request', 'Actions'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>{query.data.sessions.map(session => <tr key={session._id} className="border-t">
              <td className="p-3">{session.userId?.name || 'Deleted account'}<div className="text-xs text-gray-500">{session.userId?.email} · {session.userId?.role}</div>{session.current && <strong>Current session</strong>}{session.parentSessionId && <p>Read-only Super Admin inspection</p>}</td>
              <td className="p-3 max-w-xs break-words">{session.userAgent || 'Unknown device'}<div>{session.ipAddress || 'Unknown IP'}</div></td>
              <td className="p-3">{new Date(session.createdAt).toLocaleString()}</td>
              <td className="p-3">{new Date(session.lastSeenAt).toLocaleString()}</td>
              <td className="p-3"><div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPassword(''); setTarget({ path: `sessions/${session._id}/revoke`, label: `Revoke ${session.current ? 'your current' : 'this'} session` }) }}>Revoke session</Button>
                {scope === 'all' && session.userId && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPassword(''); setTarget({ path: `users/${session.userId?._id}/revoke-all`, label: `Sign out ${session.userId?.name} on all devices` }) }}>Revoke all</Button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {query.data.sessions.length === 0 && <p>No sessions found.</p>}
        <div className="flex gap-3 items-center">
          <Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span>Page {page} of {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}</span>
          <Button variant="outline" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </>}
    </CardContent>
  </Card>
}
