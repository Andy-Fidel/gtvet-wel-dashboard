import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import type { Placement } from '@/pages/placements-columns'

type Transfer = {
  submittedBy?: string
  _id: string; institution: string; status: string; reason: string; effectiveDate: string; lastError?: string
  placement?: { companyName: string }; learner?: { firstName: string; lastName: string; trackingId: string }
  destination: { companyName: string; location: string; endDate: string; supervisorName: string; supervisorPhone: string }
  reviewNote?: string
}
type Options = { partners: { _id: string; name: string; region: string; coordinates?: { lat?: number; lng?: number } }[]; requests: { _id: string; selfSourcedHost: { companyName: string }; placementRegion?: string; coordinates?: { lat?: number; lng?: number } }[] }

export function PlacementTransferQueue({ onChange }: { onChange: () => void }) {
  const { authFetch, user } = useAuth()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<{ transfer: Transfer; action: string } | null>(null)
  const [note, setNote] = useState('')
  const query = useQuery<Transfer[]>({ queryKey: ['placement-transfers', user?._id], queryFn: async () => {
    const response = await authFetch('/api/placement-transfers')
    if (!response.ok) throw new Error('Unable to load workplace changes')
    return response.json()
  }, refetchInterval: 60000 })
  const submit = async () => {
    if (!decision) return
    setBusy(true)
    try {
      const response = await authFetch(`/api/placement-transfers/${decision.transfer._id}/${decision.action}`, { method: 'POST', body: JSON.stringify({ note }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      toast.success(`Workplace change ${data.status.toLowerCase()}`)
      setDecision(null); setNote('')
      await client.invalidateQueries({ queryKey: ['placement-transfers'] })
      await client.invalidateQueries({ queryKey: ['workplace-history'] })
      onChange()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update request') }
    finally { setBusy(false) }
  }
  if (query.isError) return <p role="alert">Workplace changes could not be loaded. <Button onClick={() => void query.refetch()}>Retry</Button></p>
  if (!query.data?.length) return null
  return <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Workplace changes">
    <h2 className="text-lg font-bold">Workplace changes awaiting action</h2>
    {query.data.map(transfer => <div key={transfer._id} className="rounded-lg border p-3 space-y-2">
      <p className="font-semibold">{transfer.learner?.firstName} {transfer.learner?.lastName} · {transfer.learner?.trackingId}</p>
      <p>{transfer.placement?.companyName} → {transfer.destination.companyName}</p>
      <p className="text-sm">{transfer.status} · Effective {transfer.effectiveDate.slice(0, 10)} · {transfer.reason}</p>
      {transfer.lastError && <p role="alert" className="text-red-700">Activation needs attention: {transfer.lastError}. The previous placement remains active. Cancel and submit a corrected request if needed.</p>}
      {['Admin', 'Manager'].includes(user?.role || '') && transfer.institution === user?.institution && <div className="flex gap-2">
        {(transfer.status === 'Pending' ? ['approve', 'reject', 'cancel'] : ['cancel']).map(action => <Button key={action} variant="outline" onClick={() => { setDecision({ transfer, action }); setNote('') }}>{action === 'approve' ? 'Review & approve' : action === 'reject' ? 'Reject' : 'Cancel change'}</Button>)}
      </div>}
      {user?.role === 'Staff' && transfer.submittedBy === user._id && <Button variant="outline" onClick={() => { setDecision({ transfer, action: 'cancel' }); setNote('') }}>Cancel my request</Button>}
    </div>)}
    <Dialog open={!!decision} onOpenChange={open => !busy && !open && setDecision(null)}><DialogContent><DialogHeader><DialogTitle>{decision?.action === 'approve' ? 'Approve workplace change' : 'Review workplace change'}</DialogTitle></DialogHeader>
      <p>{decision?.transfer.placement?.companyName} → {decision?.transfer.destination.companyName}</p>
      <p>Effective: {decision?.transfer.effectiveDate.slice(0, 10)} · Ends: {decision?.transfer.destination.endDate.slice(0, 10)}</p>
      <p>Supervisor: {decision?.transfer.destination.supervisorName} · {decision?.transfer.destination.supervisorPhone}</p>
      <p className="text-sm">Previous evidence stays with the original placement. The new employer must complete a new agreement. Review monitoring delegation after the transfer.</p>
      <label>Review note<Input value={note} onChange={event => setNote(event.target.value)} /></label>
      <Button disabled={busy || (decision?.action === 'reject' && !note.trim())} onClick={() => void submit()}>{busy ? 'Saving…' : `Confirm ${decision?.action}`}</Button>
    </DialogContent></Dialog>
  </section>
}

export function PlacementTransferDialog({ placement, onClose, onChange, historyOnly = false }: { placement: Placement; onClose: () => void; onChange: () => void; historyOnly?: boolean }) {
  const { authFetch, user } = useAuth()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false)
  const [destination, setDestination] = useState('')
  const [fields, setFields] = useState({ reason: '', effectiveDate: new Date().toISOString().slice(0, 10), endDate: placement.endDate?.slice(0, 10) || '', supervisorName: '', supervisorPhone: '', supervisorEmail: '', placementRegion: '', lat: '', lng: '' })
  const [host, setHost] = useState({ companyName: '', sector: '', location: '' })
  const options = useQuery<Options>({ queryKey: ['transfer-options', placement._id, user?._id], enabled: !historyOnly, queryFn: async () => {
    const response = await authFetch(`/api/placements/${placement._id}/transfer-options`)
    if (!response.ok) throw new Error('Unable to load approved destinations')
    return response.json()
  } })
  const history = useQuery<{ placements: { _id: string; companyName: string; startDate: string; endDate: string; status: string; closureReason?: string }[]; transfers: Transfer[] }>({ queryKey: ['workplace-history', placement._id, user?._id], queryFn: async () => {
    const response = await authFetch(`/api/placements/${placement._id}/workplace-history`)
    if (!response.ok) throw new Error('Unable to load placement history')
    return response.json()
  } })
  const choices = [...(options.data?.partners || []).map(p => ({ value: `partner:${p._id}`, name: p.name, region: p.region, coordinates: p.coordinates })), ...(options.data?.requests || []).map(r => ({ value: `request:${r._id}`, name: `${r.selfSourcedHost.companyName} (verified learner-sourced)`, region: r.placementRegion || '', coordinates: r.coordinates }))]
  const pending = history.data?.transfers.some(t => ['Pending', 'Scheduled'].includes(t.status))
  const submit = async () => {
    setBusy(true)
    try {
      const [type, id] = destination.split(':')
      const response = await authFetch(`/api/placements/${placement._id}/${destination === 'new' ? 'transfer-lead' : 'transfers'}`, { method: 'POST', body: JSON.stringify({ ...fields, ...(destination === 'new' ? host : {}), sourceVersion: placement.workflowVersion || 0, ...(type === 'partner' ? { partner: id } : { sourceRequest: id }), coordinates: { lat: Number(fields.lat), lng: Number(fields.lng) } }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      await client.invalidateQueries({ queryKey: ['placement-transfers'] })
      await client.invalidateQueries({ queryKey: ['workplace-history'] })
      toast.success(destination === 'new' ? 'Host submitted for verification. Once approved in Placement Requests, select it under Change workplace.' : 'Workplace change submitted for institution approval'); onChange(); onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to submit workplace change') }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{historyOnly ? 'Placement history' : 'Change workplace'}</DialogTitle></DialogHeader>
    <p>{placement.learner.name || `${placement.learner.firstName || ''} ${placement.learner.lastName || ''}`} · Current workplace: {placement.companyName}</p>
    {history.isError && <p role="alert">History could not be loaded. <Button onClick={() => void history.refetch()}>Retry</Button></p>}
    <ol className="space-y-2 border-l pl-4">{history.data?.placements.map(p => <li key={p._id}><strong>{p.companyName}</strong><p className="text-sm">{p.startDate?.slice(0, 10)} – {p.endDate?.slice(0, 10)} · {p.closureReason === 'Transferred' ? 'Transferred' : p.status}</p></li>)}</ol>
    {history.data?.transfers.map(t => <p key={t._id} className="text-sm">{t.status}: {t.destination.companyName} · {t.effectiveDate.slice(0, 10)} · {t.reason}{t.reviewNote ? ` · ${t.reviewNote}` : ''}</p>)}
    {pending && !historyOnly && <p>A workplace change is already awaiting action. Institution management can review or cancel it in Workplace changes.</p>}
    {!historyOnly && !pending && <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!review) setReview(true); else void submit() }}>
      {options.isError ? <p role="alert">Destinations could not be loaded. <Button type="button" onClick={() => void options.refetch()}>Retry</Button></p> : <>
        <label className="block">New workplace<select required disabled={review} value={destination} onChange={event => { setDestination(event.target.value); const choice = choices.find(c => c.value === event.target.value); setFields(previous => ({ ...previous, placementRegion: choice?.region || '', lat: String(choice?.coordinates?.lat ?? ''), lng: String(choice?.coordinates?.lng ?? '') })) }} className="w-full rounded border p-2"><option value="">Select an approved destination</option><option value="new">New learner-sourced host (requires verification)</option>{choices.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={review} onClick={() => setDestination('new')}>Submit a new learner-sourced host</Button>
        {destination === 'new' && <fieldset className="space-y-2"><legend>New host for verification</legend>{(['companyName', 'sector', 'location'] as const).map(key => <label key={key} className="block">{key === 'companyName' ? 'Company name' : key === 'sector' ? 'Sector' : 'Location'}<Input required readOnly={review} value={host[key]} onChange={event => setHost(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</fieldset>}
        <p className="text-xs text-muted-foreground">New hosts must be verified in Placement Requests. After approval, select the verified host here to submit the transfer.</p>
        {(Object.keys(fields) as (keyof typeof fields)[]).map(key => <label className="block text-sm" key={key}>{({ reason: 'Reason for change', effectiveDate: 'Effective date', endDate: 'New end date', supervisorName: 'Supervisor name', supervisorPhone: 'Supervisor phone', supervisorEmail: 'Supervisor email (optional)', placementRegion: 'Placement region', lat: 'Latitude', lng: 'Longitude' })[key]}<Input required={key !== 'supervisorEmail'} readOnly={review} type={key === 'effectiveDate' || key === 'endDate' ? 'date' : key === 'supervisorEmail' ? 'email' : key === 'lat' || key === 'lng' ? 'number' : 'text'} step={key === 'lat' || key === 'lng' ? 'any' : undefined} min={key === 'effectiveDate' ? new Date().toISOString().slice(0, 10) : undefined} value={fields[key]} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
        {review && <p className="rounded bg-amber-50 p-3 text-sm">{placement.companyName} → {destination === 'new' ? host.companyName : choices.find(c => c.value === destination)?.name}. The current placement stays active until management approves and the effective date arrives. Previous records remain with the old employer.</p>}
        <div className="flex gap-2">{review && <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(false)}>Back</Button>}<Button disabled={busy || options.isPending || !history.data}>{busy ? 'Submitting…' : review ? 'Submit for approval' : 'Review change'}</Button></div>
      </>}
    </form>}
  </DialogContent></Dialog>
}
