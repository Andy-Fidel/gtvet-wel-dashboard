import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { endInspection, INSPECTION_KEY } from '@/lib/inspection'

export function InspectionBanner() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!user?.inspection && localStorage.getItem(INSPECTION_KEY) !== 'true') return null
  return <aside aria-label="Read-only inspection" className="rounded-xl border border-amber-300 bg-amber-100 text-amber-950 p-3 mb-3 flex flex-wrap items-center gap-3 sticky top-0 z-40">
    <div className="flex-1 min-w-0"><strong>Read-only inspection{user ? `: ${user.name} (${user.role})` : ' ended or expired'}</strong>
      <p className="text-sm">{user?.inspection ? `${user.inspection.actorName} · Ends ${new Date(user.inspection.expiresAt).toLocaleTimeString()}. Changes and offline sync are disabled.` : 'Return to your Super Admin account to continue.'}</p>
      {error && <p role="alert">{error}</p>}
    </div>
    <Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await endInspection() } catch (err) { setError(err instanceof Error ? err.message : 'Please try again'); setBusy(false) } }}>{busy ? 'Returning…' : 'Return to Super Admin'}</Button>
  </aside>
}
