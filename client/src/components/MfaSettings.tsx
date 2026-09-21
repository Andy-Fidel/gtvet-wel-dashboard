import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

export function MfaSettings() {
  const { user, authFetch } = useAuth()
  const cache = useQueryClient()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const status = useQuery<{ configured: boolean; enabled: boolean; recoveryCodesRemaining: number }>({
    queryKey: ['mfa-status', user?._id],
    queryFn: async ({ signal }) => {
      const response = await authFetch('/api/auth/security/mfa', { signal })
      if (!response.ok) throw new Error('Unable to load MFA status')
      return response.json()
    },
  })
  async function action(type: 'setup' | 'enable' | 'disable') {
    if (busy) return
    if (type === 'disable' && !window.confirm('Disable MFA and sign out all devices?')) return
    setBusy(true)
    try {
      const response = await authFetch(`/api/auth/security/mfa/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, code: code.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'MFA operation failed')
      if (type === 'setup') setSecret(data.secret)
      if (type === 'enable') {
        setRecoveryCodes(data.recoveryCodes)
        setSecret('')
        toast.success('MFA enabled. Save your recovery codes now.')
      }
      if (type === 'disable') window.location.assign('/login')
      await cache.invalidateQueries({ queryKey: ['mfa-status'] })
      await cache.invalidateQueries({ queryKey: ['security-sessions'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'MFA operation failed')
    } finally { setPassword(''); setCode(''); setBusy(false) }
  }
  return <section className="rounded-xl border p-4 space-y-3" aria-label="Multi-factor authentication">
    <h3 className="font-bold">Authenticator-app MFA</h3>
    <p className="text-sm text-gray-600">Recommended for all privileged accounts. Enrollment is opt-in; once enabled, every new sign-in requires a code. Store recovery codes securely outside this system.</p>
    {status.isPending && <p role="status">Loading MFA status…</p>}
    {status.isError && <div role="alert">{status.error.message} <Button variant="outline" onClick={() => void status.refetch()}>Retry</Button></div>}
    {status.data && <>
      <p>{status.data.enabled ? `Enabled · ${status.data.recoveryCodesRemaining} recovery codes remaining` : 'Not enabled'}</p>
      {!status.data.configured && <p role="status">Server setup required: an administrator must securely provision the MFA encryption key. Enrollment is unavailable until then.</p>}
      {status.data.configured && <>
        {!secret && <><Label htmlFor="mfa-password">Current password</Label><Input id="mfa-password" type="password" autoComplete="current-password" value={password} maxLength={256} onChange={event => setPassword(event.target.value)} /></>}
        {secret && <div className="space-y-2">
          <p>In your authenticator app, add a time-based account named <strong>GTVETS WEL ({user?.email})</strong> using this setup key. Enter its six-digit code below within 10 minutes.</p>
          <code className="block break-all bg-slate-100 p-3 select-all">{secret}</code>
        </div>}
        {(secret || status.data.enabled) && <><Label htmlFor="mfa-code">{secret ? 'Six-digit authenticator code' : 'Authenticator or recovery code'}</Label><Input id="mfa-code" autoComplete="one-time-code" maxLength={64} value={code} onChange={event => setCode(event.target.value)} /></>}
        {status.data.enabled
          ? <Button variant="destructive" disabled={busy || !password || !code} onClick={() => void action('disable')}>Disable MFA and sign out</Button>
          : secret
            ? <div className="flex gap-2"><Button disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void action('enable')}>Verify and enable MFA</Button><Button variant="outline" disabled={busy} onClick={() => { setSecret(''); setCode('') }}>Cancel setup</Button></div>
            : <Button disabled={busy || !password} onClick={() => void action('setup')}>Set up authenticator</Button>}
      </>}
    </>}
    {recoveryCodes.length > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
      <strong>Save these recovery codes now. They are shown only once.</strong>
      <p>Each code works once in place of an authenticator code. Losing both your device and these codes requires administrator-assisted recovery outside this interface.</p>
      <pre className="whitespace-pre-wrap break-all select-all">{recoveryCodes.join('\n')}</pre>
      <Button variant="outline" onClick={() => { if (window.confirm('Have you stored all recovery codes securely? They cannot be displayed again.')) setRecoveryCodes([]) }}>I have saved these codes</Button>
    </div>}
  </section>
}
