import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { IndustryPartner } from '@/types/models'

type Values = Record<string, unknown>
type Attachment = { documentId: string; fileName: string; url: string }
type Change = { _id: string; requester: string; requesterName: string; institution: string; version: number; status: string; original: Values; proposed: Values; reason: string; attachments: Attachment[]; history: { action: string; actorName: string; comment: string; at: string; proposed?: Values }[] }
type Item = { partnerId: string; partnerName: string; current: Values; request: Change }
const fields = [['name', 'Company name'], ['sector', 'Sector'], ['region', 'Region'], ['district', 'District'], ['tradeArea', 'Trade area'], ['town', 'Town'], ['location', 'Address / location'], ['contactPerson', 'General contact person'], ['contactPhone', 'General phone'], ['contactEmail', 'General email'], ['website', 'Website'], ['totalSlots', 'Total placement capacity'], ['programs', 'Eligible programmes (comma separated)']] as const
const labels: Record<string, string> = Object.fromEntries(fields)
const statuses: Record<string, string> = { InstitutionReview: 'Institution review', HQReview: 'HQ review', Returned: 'Returned for correction', Approved: 'Approved', Rejected: 'Rejected', Withdrawn: 'Withdrawn' }
const show = (value: unknown): string => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to save changes'

export function PartnerChangeForm({ partner, request, onDone }: { partner: Values & { _id: string }; request?: Change; onDone: () => void }) {
  const { authFetch, user } = useAuth()
  const client = useQueryClient()
  const initial = { ...partner, ...request?.proposed }
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(([key]) => [key, key === 'programs' ? (initial[key] as string[] || []).join(', ') : String(initial[key] ?? '')])))
  const coords = initial.coordinates as { lat?: number; lng?: number } | undefined
  const [lat, setLat] = useState(String(coords?.lat ?? ''))
  const [lng, setLng] = useState(String(coords?.lng ?? ''))
  const [reason, setReason] = useState(request?.reason || '')
  const [attachments, setAttachments] = useState<Attachment[]>(request?.attachments || [])
  const [mou, setMou] = useState(String(initial.mouDocumentUrl || ''))
  const [busy, setBusy] = useState(false)
  const upload = async (file: File, isMou: boolean) => {
    setBusy(true)
    try {
      const body = new FormData(); body.append('file', file); body.append('category', isMou ? 'MoU' : 'Other')
      const response = await authFetch('/api/documents/upload', { method: 'POST', body })
      const doc = await response.json()
      if (!response.ok) throw new Error(doc.message)
      setAttachments(previous => [...previous, { documentId: doc._id, fileName: doc.fileName, url: doc.url }])
      if (isMou) setMou(doc.url)
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true)
    try {
      const proposed: Values = {}
      for (const [field] of fields) {
        const value = field === 'totalSlots' ? Number(values[field]) : field === 'programs' ? values[field].split(',').map(v => v.trim()).filter(Boolean) : values[field].trim()
        const baseline = partner[field] ?? (field === 'totalSlots' ? 0 : field === 'programs' ? [] : '')
        if (JSON.stringify(value) !== JSON.stringify(baseline)) proposed[field] = value
      }
      if (lat || lng) {
        if (!lat || !lng) throw new Error('Provide both latitude and longitude.')
        const coordinates = { lat: Number(lat), lng: Number(lng) }
        if (JSON.stringify(coordinates) !== JSON.stringify(partner.coordinates)) proposed.coordinates = coordinates
      }
      if (mou !== String(partner.mouDocumentUrl || '')) proposed.mouDocumentUrl = mou
      const response = await authFetch(request ? `/api/partner-change-requests/${request._id}/resubmit` : `/api/industry-partners/${partner._id}/change-requests`, { method: request ? 'PUT' : 'POST', body: JSON.stringify({ proposed, reason, attachmentIds: attachments.map(a => a.documentId), version: request?.version }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      await client.invalidateQueries({ queryKey: ['partner-changes'] })
      toast.success(`Changes submitted for ${user?.role === 'Staff' ? 'institution' : 'HQ'} review`)
      onDone()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-gray-600">Approved details remain available until HQ approves your request. Explain changes to capacity and programme eligibility and attach supporting evidence where available.</p>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<Input className="mt-1" type={key === 'totalSlots' ? 'number' : key === 'contactEmail' ? 'email' : key === 'website' ? 'url' : 'text'} min={key === 'totalSlots' ? 0 : undefined} step={key === 'totalSlots' ? 1 : undefined} required={['name', 'sector', 'region', 'totalSlots'].includes(key)} maxLength={2000} value={values[key]} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>)}
      <label className="text-sm font-medium">Latitude<Input type="number" step="any" min={-90} max={90} value={lat} onChange={e => setLat(e.target.value)} /></label>
      <label className="text-sm font-medium">Longitude<Input type="number" step="any" min={-180} max={180} value={lng} onChange={e => setLng(e.target.value)} /></label>
    </fieldset>
    <label className="block text-sm font-medium">Reason for changes<Textarea required minLength={5} maxLength={3000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Supporting document<Input type="file" disabled={busy || attachments.length >= 5} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, false); e.target.value = '' }} /></label>
      <label className="text-sm">Replacement MoU<Input type="file" disabled={busy || attachments.length >= 5} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, true); e.target.value = '' }} /></label>
    </div>
    {attachments.map(a => <div className="flex items-center gap-3 text-sm" key={a.documentId}><a href={a.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{a.fileName}</a><Button type="button" variant="ghost" disabled={busy} onClick={() => { setAttachments(attachments.filter(d => d.documentId !== a.documentId)); if (mou === a.url) setMou(String(partner.mouDocumentUrl || '')) }}>Remove</Button></div>)}
    <Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Submit changes for review'}</Button>
  </form>
}

export function PartnerChangeQueue({ onChange }: { onChange: () => void }) {
  const { authFetch, user } = useAuth()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Item | null>(null)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery<{ items: Item[]; total: number }>({ queryKey: ['partner-changes', user?._id, page], queryFn: async () => {
    const response = await authFetch(`/api/partner-change-requests?page=${page}`)
    if (!response.ok) throw new Error('Unable to load partner change requests')
    return response.json()
  }, refetchInterval: 60000 })
  const act = async (action: string) => {
    if (!selected) return
    setBusy(true)
    try {
      const response = await authFetch(`/api/partner-change-requests/${selected.request._id}/${action}`, { method: 'PUT', body: JSON.stringify({ version: selected.request.version, comment }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      toast.success(`Request: ${statuses[data.status] || data.status}`)
      setSelected(null); setComment('')
      await client.invalidateQueries({ queryKey: ['partner-changes'] }); onChange()
    } catch (error) { toast.error(errorMessage(error)); await query.refetch() }
    finally { setBusy(false) }
  }
  const change = selected?.request
  const own = change?.requester === user?._id
  const canReview = change && !own && ((change.status === 'InstitutionReview' && ['Admin', 'Manager'].includes(user?.role || '')) || (change.status === 'HQReview' && ['SuperAdmin', 'HQManager'].includes(user?.role || '')))
  return <section className="w-full rounded-2xl border bg-white p-5 space-y-3" aria-label="Partner change requests">
    <h3 className="text-lg font-bold">Partner change requests</h3>
    <p className="text-sm text-gray-500">Track corrections and review proposed changes to the shared registry.</p>
    {query.isPending ? <p>Loading requests…</p> : query.isError ? <p role="alert">Unable to load requests. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p> : !query.data.items.length ? <p className="text-sm">No change requests.</p> : <div className="space-y-2">{query.data.items.map(item => <button key={item.request._id} type="button" className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left hover:bg-gray-50" onClick={() => { setSelected(item); setEditing(false); setComment('') }}><span><strong>{item.partnerName}</strong><span className="block text-sm text-gray-500">{item.request.institution} · {item.request.requesterName}</span></span><span className="text-sm rounded-full bg-amber-50 px-3 py-1">{statuses[item.request.status]}</span></button>)}</div>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={query.isFetching || page * 20 >= (query.data?.total || 0)} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null) }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.partnerName}: {editing ? 'Correct request' : 'Review changes'}</DialogTitle><DialogDescription>Check the original, current and proposed details before making a decision.</DialogDescription></DialogHeader>
      {selected && change && (editing ? <PartnerChangeForm partner={{ ...selected.current, _id: selected.partnerId }} request={change} onDone={() => { setSelected(null); onChange() }} /> : <div className="space-y-4">
        <p className="text-sm"><strong>{statuses[change.status]}</strong> · {change.institution} · {change.requesterName}</p><p className="whitespace-pre-wrap">{change.reason}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Field', 'When submitted', 'Current', 'Proposed'].map(label => <th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{Object.entries(change.proposed).map(([field, value]) => <tr key={field} className="border-t"><th className="p-2 text-left">{labels[field] || field}</th><td className="p-2 break-all">{show(change.original[field])}</td><td className={`p-2 break-all ${JSON.stringify(selected.current[field] ?? null) !== JSON.stringify(change.original[field] ?? null) ? 'bg-amber-100' : ''}`}>{show(selected.current[field])}</td><td className="p-2 break-all">{show(value)}</td></tr>)}</tbody></table></div>
        {change.attachments.map(a => <a key={a.documentId} href={a.url} target="_blank" rel="noreferrer" className="block text-blue-700 underline">{a.fileName}</a>)}
        <details><summary className="cursor-pointer font-medium">Decision history</summary><ol className="space-y-2 mt-2">{change.history.map((entry, index) => <li className="text-sm border-l-2 pl-3" key={index}>{entry.action} · {entry.actorName} · {new Date(entry.at).toLocaleString()}<p className="whitespace-pre-wrap">{entry.comment}</p>{entry.proposed && <p className="break-all text-gray-500">Submitted values: {JSON.stringify(entry.proposed)}</p>}</li>)}</ol></details>
        {canReview && <><label className="block text-sm font-medium">Review comment (required when returning or rejecting)<Textarea maxLength={3000} disabled={busy} value={comment} onChange={e => setComment(e.target.value)} /></label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void act('approve')}>{change.status === 'InstitutionReview' ? 'Endorse and send to HQ' : 'Approve changes'}</Button><Button variant="outline" disabled={busy || comment.trim().length < 5} onClick={() => void act('return')}>Return for correction</Button><Button variant="destructive" disabled={busy || comment.trim().length < 5} onClick={() => void act('reject')}>Reject</Button></div></>}
        {own && ['InstitutionReview', 'HQReview', 'Returned'].includes(change.status) && <div className="flex gap-2">{change.status === 'Returned' && <Button disabled={busy} onClick={() => setEditing(true)}>Correct and resubmit</Button>}<Button disabled={busy} variant="outline" onClick={() => void act('withdraw')}>Withdraw request</Button></div>}
      </div>)}
    </DialogContent></Dialog>
  </section>
}

const relationshipFields = [['contactPerson', 'Institution contact person'], ['contactPhone', 'Contact phone'], ['contactEmail', 'Contact email'], ['liaisonOfficer', 'Liaison officer'], ['notes', 'Relationship notes']] as const
export function PartnerRelationship({ partner, onDone }: { partner: IndustryPartner; onDone: () => void }) {
  const { authFetch, user } = useAuth()
  const query = useQuery({ queryKey: ['partner-relationship', user?._id, partner._id], queryFn: async () => { const response = await authFetch(`/api/industry-partners/${partner._id}/institution-details`); if (!response.ok) throw new Error('Unable to load relationship details'); return response.json() as Promise<Record<string, string | number>> } })
  const [draft, setDraft] = useState<Record<string, string | number> | null>(null)
  const [busy, setBusy] = useState(false)
  const values = draft || query.data || {}
  const canEdit = ['Admin', 'Manager'].includes(user?.role || '')
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const body = { version: values.version || 0, ...Object.fromEntries(relationshipFields.map(([key]) => [key, values[key] || ''])) }
      const response = await authFetch(`/api/industry-partners/${partner._id}/institution-details`, { method: 'PUT', body: JSON.stringify(body) })
      const data = await response.json(); if (!response.ok) throw new Error(data.message)
      await query.refetch(); toast.success('Institution relationship updated'); onDone()
    } catch (error) { toast.error(errorMessage(error)) } finally { setBusy(false) }
  }
  if (query.isPending) return <p>Loading relationship details…</p>
  if (query.isError) return <p role="alert">Unable to load details. <Button onClick={() => void query.refetch()}>Retry</Button></p>
  return <form onSubmit={save} className="space-y-4"><p className="text-sm text-gray-600">These details belong to your institution and do not change the shared partner registry.</p>{relationshipFields.map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}{key === 'notes' ? <Textarea maxLength={3000} disabled={!canEdit || busy} value={values[key] || ''} onChange={e => setDraft({ ...values, [key]: e.target.value })} /> : <Input maxLength={3000} type={key === 'contactEmail' ? 'email' : 'text'} disabled={!canEdit || busy} value={values[key] || ''} onChange={e => setDraft({ ...values, [key]: e.target.value })} />}</label>)}{canEdit && <Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save institution details'}</Button>}</form>
}
