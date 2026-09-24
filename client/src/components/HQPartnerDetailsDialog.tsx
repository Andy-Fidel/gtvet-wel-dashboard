import { format } from 'date-fns'
import { Building2, ExternalLink, FileClock, Mail, MapPin, Pencil, Phone, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { IndustryPartner } from '@/types/models'

export type PartnerDependencySummary = Record<string, number>

export type PartnerDeletionBlocker = {
  key: string
  label: string
  count: number
}

export type HQPartnerRecord = IndustryPartner & {
  district?: string
  tradeArea?: string
  town?: string
  mouDocumentUrl?: string
  linkedInstitutions?: string[]
  createdAt?: string
  updatedAt?: string
  addedBy?: { name?: string; role?: string; institution?: string; region?: string } | null
  approvalReviewedBy?: { name?: string; role?: string } | null
}

export type HQPartnerDetails = {
  partner: HQPartnerRecord
  dependencies: PartnerDependencySummary
  auditHistory: Array<{
    _id?: string
    action: string
    summary: string
    actorName: string
    actorRole?: string
    changedFields?: string[]
    createdAt: string
  }>
  deletion: {
    allowed: boolean
    blockers: PartnerDeletionBlocker[]
  }
}

const dependencyLabels: Record<string, string> = {
  placements: 'Placements',
  placementRequests: 'Placement requests',
  attendanceLogs: 'Attendance records',
  employerEvaluations: 'Employer evaluations',
  slotAllocations: 'Reserved allocations',
  placementAgreements: 'Placement agreements',
  placementMessages: 'Partner messages',
  vacancies: 'Vacancies',
  portalAccounts: 'Portal accounts',
  documents: 'Documents',
  supportTickets: 'Support tickets',
  linkedInstitutions: 'Linked institutions',
  reportedUsedSlots: 'Reported used slots',
}

const display = (value?: string | number | null) => value === undefined || value === null || value === '' ? 'Not provided' : String(value)
const dateLabel = (value?: string) => value ? format(new Date(value), 'dd MMM yyyy, HH:mm') : 'Not available'

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{display(value)}</p></div>
}

export function HQPartnerDetailsDialog({
  open,
  loading,
  details,
  onOpenChange,
  onEdit,
  onDelete,
  canManage,
}: {
  open: boolean
  loading: boolean
  details: HQPartnerDetails | null
  onOpenChange: (open: boolean) => void
  onEdit: (partner: HQPartnerRecord) => void
  onDelete: (details: HQPartnerDetails) => void
  canManage: boolean
}) {
  const partner = details?.partner
  const dependencyEntries = Object.entries(details?.dependencies || {}).filter(([, count]) => count > 0)
  const safeWebsite = partner?.website && /^https?:\/\//i.test(partner.website) ? partner.website : null
  const safeMouUrl = partner?.mouDocumentUrl && /^(https?:\/\/|\/)/i.test(partner.mouDocumentUrl) ? partner.mouDocumentUrl : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[2rem] border-none bg-white p-0 sm:max-w-4xl">
        <div className="p-6 sm:p-8">
          {loading ? <div className="py-24 text-center font-semibold text-slate-400">Loading complete partner record…</div> : partner && details ? (
            <div className="space-y-7">
              <DialogHeader className="pr-12">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl bg-amber-50 p-3"><Building2 className="h-6 w-6 text-amber-600" /></div>
                  <div>
                    <DialogTitle>{partner.name}</DialogTitle>
                    <DialogDescription className="mt-1">Complete HQ registry record and operational usage.</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Badge className="border-0 bg-blue-100 text-blue-700">{partner.partnerType === 'MasterCraftPerson' ? 'Master Craft Person' : display(partner.partnerType).replace(/([a-z])([A-Z])/g, '$1 $2')}</Badge>
                <Badge className={`border-0 ${partner.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{partner.status}</Badge>
                <Badge className={`border-0 ${partner.approvalStatus === 'Rejected' ? 'bg-rose-100 text-rose-700' : partner.approvalStatus === 'PendingHQApproval' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{partner.approvalStatus === 'PendingHQApproval' ? 'Pending HQ Approval' : (partner.approvalStatus || 'Approved')}</Badge>
                <Badge className="border-0 bg-violet-100 text-violet-700">{display(partner.operatingModel).replace(/([a-z])([A-Z])/g, '$1 $2')}</Badge>
              </div>

              <section>
                <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Registry details</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Sector" value={partner.sector} />
                  <Detail label="Trade area" value={partner.tradeArea} />
                  <Detail label="Region" value={partner.region} />
                  <Detail label="District" value={partner.district} />
                  <Detail label="Town" value={partner.town} />
                  <Detail label="Capacity" value={`${partner.usedSlots || 0} used of ${partner.totalSlots || 0}`} />
                  <Detail label="Registered" value={dateLabel(partner.createdAt)} />
                  <Detail label="Last updated" value={dateLabel(partner.updatedAt)} />
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-100 p-5">
                  <h3 className="flex items-center gap-2 font-black text-slate-900"><MapPin className="h-5 w-5 text-amber-600" /> Workplace location</h3>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p><span className="font-bold text-slate-800">Address:</span> {display(partner.location)}</p>
                    <p><span className="font-bold text-slate-800">GhanaPost GPS:</span> {display(partner.ghanaPostGps)}</p>
                    <p><span className="font-bold text-slate-800">Coordinates:</span> {partner.coordinates?.lat != null && partner.coordinates?.lng != null ? `${partner.coordinates.lat}, ${partner.coordinates.lng}` : 'Pending capture'}</p>
                    <p><span className="font-bold text-slate-800">Verification:</span> {display(partner.locationVerificationStatus).replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
                    {partner.locationVerificationNotes ? <p className="rounded-xl bg-slate-50 p-3">{partner.locationVerificationNotes}</p> : null}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-100 p-5">
                  <h3 className="flex items-center gap-2 font-black text-slate-900"><Mail className="h-5 w-5 text-amber-600" /> Contact and documents</h3>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <p>{display(partner.contactPerson)}</p>
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> {display(partner.contactPhone)}</p>
                    <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> {display(partner.contactEmail)}</p>
                    {safeWebsite ? <a className="inline-flex items-center gap-2 font-bold text-blue-700 hover:underline" href={safeWebsite} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Website</a> : null}
                    {safeMouUrl ? <a className="ml-4 inline-flex items-center gap-2 font-bold text-blue-700 hover:underline" href={safeMouUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> MoU document</a> : null}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-500"><ShieldCheck className="h-4 w-4" /> Governance</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Detail label="Submitted by" value={`${partner.addedBy?.name || 'Unknown'}${partner.addedBy?.role ? ` · ${partner.addedBy.role}` : ''}`} />
                  <Detail label="HQ reviewer" value={partner.approvalReviewedBy?.name || 'Awaiting review'} />
                  <Detail label="Linked institutions" value={partner.linkedInstitutions?.length || 0} />
                </div>
                {partner.approvalComment ? <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><span className="font-bold">HQ comment:</span> {partner.approvalComment}</p> : null}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Operational usage</h3>
                {dependencyEntries.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{dependencyEntries.map(([key, count]) => <Detail key={key} label={dependencyLabels[key] || key} value={count} />)}</div> : <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">This partner has no linked operational records.</p>}
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-500"><FileClock className="h-4 w-4" /> Recent history</h3>
                {details.auditHistory.length ? <div className="space-y-2">{details.auditHistory.map((entry, index) => (
                  <div key={entry._id || `${entry.createdAt}-${index}`} className="flex flex-col gap-1 rounded-2xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-bold text-slate-800">{entry.summary}</p><p className="text-xs text-slate-500">{entry.actorName} · {entry.actorRole || 'User'}</p></div>
                    <p className="text-xs font-semibold text-slate-400">{dateLabel(entry.createdAt)}</p>
                  </div>
                ))}</div> : <p className="text-sm text-slate-500">No audit events are available for this record.</p>}
              </section>

              {canManage ? <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <Button variant="outline" className="rounded-xl" onClick={() => onEdit(partner)}><Pencil className="mr-2 h-4 w-4" /> Edit partner</Button>
                <Button variant="outline" className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => onDelete(details)} disabled={!details.deletion.allowed}><Trash2 className="mr-2 h-4 w-4" /> Permanently delete</Button>
                {!details.deletion.allowed ? <div className="self-center text-xs font-semibold text-slate-500">
                  <p>Records with operational or review history must be marked inactive.</p>
                  {details.deletion.blockers.length ? <p className="mt-1 text-slate-400">Blocking history: {details.deletion.blockers.map(blocker => `${blocker.count} ${blocker.label}`).join(', ')}.</p> : null}
                </div> : null}
              </div> : null}
            </div>
          ) : <div className="py-24 text-center font-semibold text-rose-600">The complete partner record could not be loaded.</div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
