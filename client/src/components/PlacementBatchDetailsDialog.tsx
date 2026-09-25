import { CalendarDays, MapPin, UserRound, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type LearnerSummary = {
  _id: string
  firstName?: string
  middleName?: string
  lastName?: string
  name?: string
  trackingId?: string
  indexNumber?: string
  program?: string
  year?: string
}

type ConvertedPlacement = {
  _id: string
  learner: LearnerSummary
  companyName?: string
  sector?: string
  location?: string
  supervisorName?: string
  supervisorPhone?: string
  supervisorEmail?: string
  startDate?: string
  endDate?: string
  status?: string
  placementRegion?: string
  worksiteMode?: string
  locationVerificationStatus?: string
  trackingId?: string
  closureReason?: string
}

export type PlacementBatchDetails = {
  _id: string
  institution: string
  program: string
  requestedSlots: number
  status: string
  sourceType?: 'InstitutionFound' | 'LearnerFound'
  startDate?: string
  endDate?: string
  academicYear?: string
  placementRegion?: string
  createdAt: string
  verifiedAt?: string
  partner?: { name?: string; sector?: string; region?: string } | null
  learners: LearnerSummary[]
  convertedPlacementIds?: ConvertedPlacement[]
  submittedBy?: { name?: string; role?: string } | null
  reviewedByInstitution?: { name?: string; role?: string } | null
  selfSourcedHost?: { companyName?: string; sector?: string; location?: string; town?: string; contactPerson?: string; contactPhone?: string; contactEmail?: string }
  regionalComment?: string
  hqComment?: string
  institutionComment?: string
  verificationNotes?: string
  rejectionReason?: string
}

const formatDate = (value?: string) => {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const learnerName = (learner?: LearnerSummary | null) => learner?.name
  || [learner?.firstName, learner?.middleName, learner?.lastName].filter(Boolean).join(' ')
  || 'Unnamed learner'

const statusTone = (status?: string) => status === 'Active' || status === 'Converted' || status === 'Completed'
  ? 'bg-emerald-100 text-emerald-700'
  : status === 'Rejected' || status === 'Terminated'
    ? 'bg-rose-100 text-rose-700'
    : 'bg-amber-100 text-amber-700'

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>
}

export function PlacementBatchDetailsDialog({
  open,
  loading,
  details,
  error,
  onRetry,
  onOpenChange,
}: {
  open: boolean
  loading: boolean
  details: PlacementBatchDetails | null
  error: string
  onRetry: () => void
  onOpenChange: (open: boolean) => void
}) {
  const placementsByLearner = new Map((details?.convertedPlacementIds || []).map(placement => [String(placement.learner?._id), placement]))
  const companyName = details?.partner?.name || details?.selfSourcedHost?.companyName || 'Custom workplace'

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[2rem] border-none bg-white p-0 sm:max-w-5xl">
      <div className="p-6 sm:p-8">
        {loading ? <div className="py-24 text-center font-semibold text-slate-400">Loading learner placement details…</div> : error ? <div role="alert" className="py-20 text-center"><p className="font-bold text-rose-700">{error}</p><Button variant="outline" className="mt-4 rounded-xl" onClick={onRetry}>Retry</Button></div> : details ? <div className="space-y-6">
          <DialogHeader className="pr-12">
            <DialogTitle>Placement Batch Details</DialogTitle>
            <DialogDescription>{companyName} · {details.institution}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Badge className={`border-0 ${statusTone(details.status)}`}>{details.status.replaceAll('_', ' ')}</Badge>
            <Badge className="border-0 bg-blue-100 text-blue-700">{details.sourceType === 'LearnerFound' ? 'Learner sourced' : 'Institution sourced'}</Badge>
            {details.academicYear ? <Badge className="border-0 bg-violet-100 text-violet-700">{details.academicYear}</Badge> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Batch placement start" value={formatDate(details.startDate)} />
            <Summary label="Batch placement end" value={formatDate(details.endDate)} />
            <Summary label="Programme" value={details.program || 'Not provided'} />
            <Summary label="Learners" value={details.learners.length || details.requestedSlots} />
            <Summary label="Placement region" value={details.placementRegion || details.partner?.region || 'Not provided'} />
            <Summary label="Submitted" value={formatDate(details.createdAt)} />
            <Summary label="Submitted by" value={details.submittedBy?.name || 'Not available'} />
            <Summary label="Reviewed by" value={details.reviewedByInstitution?.name || 'Not reviewed'} />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-black text-slate-900"><UsersRound className="h-5 w-5 text-amber-600" /> Learner placements</h3>
              <p className="text-xs font-semibold text-slate-500">{details.convertedPlacementIds?.length ? 'Actual activated placement records' : 'Planned batch placement period'}</p>
            </div>
            <div className="space-y-3">
              {details.learners.map(learner => {
                const placement = placementsByLearner.get(String(learner._id))
                return <article key={learner._id} className="rounded-3xl border border-slate-100 p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-amber-600" /><h4 className="truncate font-black text-slate-900">{learnerName(learner)}</h4></div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{learner.trackingId || placement?.trackingId || 'No tracking ID'}{learner.indexNumber ? ` · ${learner.indexNumber}` : ''}</p>
                      <p className="mt-1 text-xs text-slate-500">{learner.program || details.program}{learner.year ? ` · ${learner.year}` : ''}</p>
                    </div>
                    <Badge className={`w-fit border-0 ${statusTone(placement?.status || details.status)}`}>{(placement?.status || details.status).replaceAll('_', ' ')}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex gap-2 rounded-2xl bg-slate-50 p-3"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Start date</p><p className="text-sm font-bold text-slate-800">{formatDate(placement?.startDate || details.startDate)}</p></div></div>
                    <div className="flex gap-2 rounded-2xl bg-slate-50 p-3"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">End date</p><p className="text-sm font-bold text-slate-800">{formatDate(placement?.endDate || details.endDate)}</p></div></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Workplace</p><p className="text-sm font-bold text-slate-800">{placement?.companyName || companyName}</p></div>
                    <div className="flex gap-2 rounded-2xl bg-slate-50 p-3"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Location</p><p className="text-sm font-bold text-slate-800">{placement?.location || details.selfSourcedHost?.location || details.selfSourcedHost?.town || 'Not provided'}</p></div></div>
                  </div>
                  {placement?.supervisorName ? <p className="mt-3 text-sm text-slate-600"><span className="font-bold text-slate-800">Supervisor:</span> {placement.supervisorName}{placement.supervisorPhone ? ` · ${placement.supervisorPhone}` : ''}{placement.supervisorEmail ? ` · ${placement.supervisorEmail}` : ''}</p> : null}
                </article>
              })}
              {details.learners.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">No learner records are available for this batch.</p> : null}
            </div>
          </section>

          {(details.rejectionReason || details.verificationNotes || details.institutionComment || details.regionalComment || details.hqComment) ? <section className="rounded-3xl bg-slate-50 p-5"><h3 className="font-black text-slate-900">Review notes</h3><div className="mt-3 space-y-2 text-sm text-slate-700">{details.rejectionReason ? <p><strong>Rejection:</strong> {details.rejectionReason}</p> : null}{details.verificationNotes ? <p><strong>Verification:</strong> {details.verificationNotes}</p> : null}{details.institutionComment ? <p><strong>Institution:</strong> {details.institutionComment}</p> : null}{details.regionalComment ? <p><strong>Regional:</strong> {details.regionalComment}</p> : null}{details.hqComment ? <p><strong>HQ:</strong> {details.hqComment}</p> : null}</div></section> : null}
        </div> : null}
      </div>
    </DialogContent>
  </Dialog>
}
