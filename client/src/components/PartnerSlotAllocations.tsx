import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/lib/toast'
import type { IndustryPartner } from '@/types/models'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Allocation = {
  _id: string
  institution: string
  slots: number
  startDate: string
  endDate: string
  academicYear?: string
  notes?: string
  agreementReference?: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Expired'
  reviewComment?: string
  createdAt: string
}

const formatDate = (value: string) => new Date(value).toLocaleDateString()

export function PartnerSlotAllocations({ partner, open, onOpenChange, onChanged }: {
  partner: IndustryPartner
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}) {
  const { authFetch, user } = useAuth()
  const [items, setItems] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ slots: '1', startDate: '', endDate: '', academicYear: '', agreementReference: '', notes: '' })
  const [comments, setComments] = useState<Record<string, string>>({})
  const canRequest = ['Admin', 'Manager'].includes(user?.role || '')
  const canReview = ['SuperAdmin', 'HQManager'].includes(user?.role || '') || (user?.role === 'IndustryPartner' && (user.partnerPortalRole || 'Coordinator') === 'Coordinator')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authFetch(`/api/industry-partners/${partner._id}/slot-allocations`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Unable to load slot allocations')
      setItems(data)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load slot allocations') }
    finally { setLoading(false) }
  }, [authFetch, partner._id])

  useEffect(() => { if (open) void load() }, [open, load])

  const request = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true)
    try {
      const response = await authFetch(`/api/industry-partners/${partner._id}/slot-allocations`, { method: 'POST', body: JSON.stringify({ ...form, slots: Number(form.slots) }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to request reserved slots')
      toast.success('Reserved slot request submitted')
      setForm({ slots: '1', startDate: '', endDate: '', academicYear: '', agreementReference: '', notes: '' })
      await load(); onChanged?.()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to request reserved slots') }
    finally { setBusy(false) }
  }

  const act = async (item: Allocation, action: 'approve' | 'reject' | 'cancel') => {
    setBusy(true)
    try {
      const response = await authFetch(`/api/slot-allocations/${item._id}/${action}`, { method: 'PUT', body: JSON.stringify({ reviewComment: comments[item._id] || '' }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to update slot allocation')
      toast.success(`Slot allocation ${data.status.toLowerCase()}`)
      await load(); onChanged?.()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update slot allocation') }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-white">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-[#FFB800]" /> Reserved slots: {partner.name}</DialogTitle><DialogDescription>Approved reservations protect an institution’s slots for the agreed dates. Unreserved capacity remains shared.</DialogDescription></DialogHeader>
    {partner.institutionCapacity && <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><span className="block text-gray-500">Reserved for you</span><strong>{partner.institutionCapacity.reservedAvailable} available</strong></div><div><span className="block text-gray-500">Shared pool</span><strong>{partner.institutionCapacity.sharedAvailable} available</strong></div><div><span className="block text-gray-500">Total available to you</span><strong>{partner.institutionCapacity.availableSlots}</strong></div></div>}
    {canRequest && <form onSubmit={request} className="space-y-4 rounded-xl border p-4"><div><h3 className="font-bold">Request reserved slots</h3><p className="text-sm text-gray-500">The partner coordinator or HQ Manager must approve this request.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Number of slots<Input required type="number" min={1} max={partner.totalSlots} value={form.slots} onChange={event => setForm({ ...form, slots: event.target.value })} /></label><label className="text-sm font-medium">Academic year<Input placeholder="2026/2027" value={form.academicYear} onChange={event => setForm({ ...form, academicYear: event.target.value })} /></label><label className="text-sm font-medium">Start date<Input required type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label><label className="text-sm font-medium">End date<Input required type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></label></div><label className="block text-sm font-medium">Agreement reference<Input placeholder="MoU number, letter reference or meeting date" value={form.agreementReference} onChange={event => setForm({ ...form, agreementReference: event.target.value })} /></label><label className="block text-sm font-medium">Arrangement notes<Textarea required minLength={5} maxLength={3000} placeholder="Describe the agreed placement arrangement." value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><Button disabled={busy} type="submit">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit for approval</Button></form>}
    <section className="space-y-3"><h3 className="font-bold">Allocation history</h3>{loading ? <p className="text-sm text-gray-500">Loading allocations…</p> : items.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-gray-500">No slot allocations recorded.</p> : items.map(item => <article key={item._id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{item.slots} reserved slot{item.slots === 1 ? '' : 's'}</strong><p className="text-sm text-gray-600">{item.institution} · {formatDate(item.startDate)}–{formatDate(item.endDate)}</p>{item.academicYear && <p className="text-xs text-gray-500">Academic year {item.academicYear}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : item.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{item.status}</span></div>{item.agreementReference && <p className="mt-2 text-sm"><strong>Reference:</strong> {item.agreementReference}</p>}{item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.notes}</p>}{item.reviewComment && <p className="mt-2 rounded-lg bg-gray-50 p-2 text-sm"><strong>Review:</strong> {item.reviewComment}</p>}{item.status === 'Pending' && <div className="mt-3 space-y-2">{canReview && <Textarea placeholder="Review comment; required when rejecting" value={comments[item._id] || ''} onChange={event => setComments({ ...comments, [item._id]: event.target.value })} />}<div className="flex flex-wrap gap-2">{canReview && <><Button disabled={busy} size="sm" onClick={() => void act(item, 'approve')}>Approve</Button><Button disabled={busy || (comments[item._id] || '').trim().length < 5} size="sm" variant="destructive" onClick={() => void act(item, 'reject')}>Reject</Button></>}{canRequest && <Button disabled={busy} size="sm" variant="outline" onClick={() => void act(item, 'cancel')}>Cancel request</Button>}</div></div>}</article>)}</section>
  </DialogContent></Dialog>
}
