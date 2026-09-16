import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { switchInspectionContext } from '@/lib/inspection'

export function InspectUserDialog({ target, onClose }: { target: { _id: string; name: string; role: string; email: string }; onClose: () => void }) {
  const { authFetch, isSyncingOfflineQueue } = useAuth()
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="bg-white text-gray-900">
      <DialogHeader><DialogTitle>Inspect as {target.name}</DialogTitle><DialogDescription>View this account’s portal for up to 15 minutes using its existing permissions. Inspection is read-only and audited. All tabs in this browser will switch accounts.</DialogDescription></DialogHeader>
      <p className="text-sm">{target.email} · {target.role}</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); if (busy || isSyncingOfflineQueue) return
        setBusy(true); setError('')
        try {
          const response = await authFetch('/api/auth/inspection/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: target._id, password, reason }) })
          const data = await response.json()
          if (!response.ok) throw new Error(data.message || 'Unable to start inspection')
          switchInspectionContext(true, '/')
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to start inspection'); setBusy(false) }
        finally { setPassword('') }
      }}>
        <Label htmlFor="inspection-reason">Reason for inspection</Label>
        <Input id="inspection-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} required />
        <Label htmlFor="inspection-password">Your Super Admin password</Label>
        <Input id="inspection-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={256} required />
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {isSyncingOfflineQueue && <p role="status">Wait for offline sync to finish before switching accounts.</p>}
        <div className="flex gap-2"><Button disabled={busy || isSyncingOfflineQueue} type="submit">{busy ? 'Starting…' : 'Start read-only inspection'}</Button><Button disabled={busy} variant="outline" type="button" onClick={onClose}>Cancel</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
