import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

type PendingAllocation = {
  _id: string
  institution: string
  slots: number
  startDate: string
  endDate: string
  academicYear?: string
  agreementReference?: string
  notes?: string
  createdAt: string
  partner: { _id: string; name: string; region?: string; totalSlots: number; status: string; approvalStatus?: string } | null
  requestedBy: { name: string; email?: string } | null
}

type PendingPage = {
  items: PendingAllocation[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const formatDate = (value: string) => new Date(value).toLocaleDateString()

export function PendingSlotApprovals({ onChanged }: { onChanged?: () => void }) {
  const { authFetch } = useAuth()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PendingPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})
  const requestSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(false)
    try {
      const response = await authFetch(`/api/slot-allocations/pending?page=${page}&pageSize=20`)
      if (!response.ok) throw new Error('Unable to load pending slot approvals')
      const result = await response.json() as PendingPage
      if (sequence !== requestSequence.current) return
      setData(result)
      if (page > 1 && result.items.length === 0 && result.total > 0) setPage(Math.max(1, result.totalPages))
    } catch {
      if (sequence === requestSequence.current) setError(true)
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [authFetch, page])

  useEffect(() => {
    void load()
    return () => { requestSequence.current += 1 }
  }, [load])

  const decide = async (item: PendingAllocation, action: 'approve' | 'reject') => {
    const reviewComment = (comments[item._id] || '').trim()
    if (action === 'reject' && reviewComment.length < 5) {
      toast.error('Enter a rejection reason of at least five characters')
      return
    }
    setBusyId(item._id)
    try {
      const response = await authFetch(`/api/slot-allocations/${item._id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewComment }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Unable to review slot request')
      toast.success(action === 'approve' ? 'Reserved slots approved' : 'Reserved slots rejected')
      await load()
      onChanged?.()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Unable to review slot request')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return <Card className="rounded-[2rem] border-gray-100 shadow-xl">
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
      <div>
        <CardTitle className="text-xl font-black">Pending reserved slot approvals</CardTitle>
        <CardDescription>Requests from all institutions, oldest first. Approval reserves capacity for the requested dates.</CardDescription>
      </div>
      <Button variant="outline" size="sm" disabled={loading || busyId !== null} onClick={() => void load()}>Refresh</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {error ? <div role="alert" className="flex items-center gap-3 text-sm text-rose-700">Could not load pending requests. <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>
        : loading ? <p className="py-8 text-center text-gray-500">Loading slot requests…</p>
        : !data?.items.length ? <p className="rounded-xl border border-dashed p-8 text-center text-gray-500">No pending reserved slot requests.</p>
        : <>
          <p className="text-sm text-gray-500">{data.total} pending request{data.total === 1 ? '' : 's'}</p>
          {data.items.map((item) => <article key={item._id} className="space-y-3 rounded-2xl border border-gray-200 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900">{item.institution} → {item.partner?.name || 'Partner unavailable'}</h3>
                <p className="text-sm text-gray-600">{item.slots} slot{item.slots === 1 ? '' : 's'} · {formatDate(item.startDate)}–{formatDate(item.endDate)}{item.academicYear ? ` · ${item.academicYear}` : ''}</p>
                <p className="mt-1 text-xs text-gray-500">Requested by {item.requestedBy?.name || 'Unknown'} on {formatDate(item.createdAt)}{item.partner?.region ? ` · ${item.partner.region}` : ''}</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Pending</span>
            </div>
            {item.agreementReference && <p className="text-sm text-gray-700"><strong>Agreement:</strong> {item.agreementReference}</p>}
            {item.notes && <p className="whitespace-pre-wrap text-sm text-gray-700"><strong>Arrangement:</strong> {item.notes}</p>}
            {item.partner && <p className="text-xs text-gray-500">Partner capacity: {item.partner.totalSlots} total slots</p>}
            <label className="block text-sm font-medium text-gray-700">Review comment
              <Textarea className="mt-1" value={comments[item._id] || ''} onChange={(event) => setComments((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Optional for approval; required for rejection" maxLength={3000} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busyId !== null || !item.partner} onClick={() => void decide(item, 'approve')}>Approve</Button>
              <Button size="sm" variant="destructive" disabled={busyId !== null || !item.partner || (comments[item._id] || '').trim().length < 5} onClick={() => void decide(item, 'reject')}>Reject</Button>
            </div>
          </article>)}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
            <span className="text-sm text-gray-600">Page {page} of {Math.max(data.totalPages, 1)}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </>}
    </CardContent>
  </Card>
}
