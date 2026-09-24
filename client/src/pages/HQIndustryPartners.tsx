import { PartnerInsights } from '@/components/PartnerInsights'
import { PartnerChangeQueue } from '@/components/PartnerChanges'
import { canApproveHQ } from '@/lib/rbac'
import { useCallback, useEffect, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, Building2, CheckCircle2, Clock3, Eye, Loader2, Mail, MapPin, Plus, Search, Trash2, UserPlus, XCircle } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { IndustryPartnerForm } from "./IndustryPartnerForm"
import { PartnerBulkRegistration } from './PartnerBulkRegistration'
import { PartnerSlotAllocations } from '@/components/PartnerSlotAllocations'
import { HQPartnerDetailsDialog, type HQPartnerDetails, type HQPartnerRecord } from '@/components/HQPartnerDetailsDialog'

type HQIndustryPartner = HQPartnerRecord

interface HQIndustryPartnersResponse {
  items: HQIndustryPartner[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  summary: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
}

export default function HQIndustryPartners() {
  const { authFetch, user } = useAuth()
  const [partners, setPartners] = useState<HQIndustryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | "PendingHQApproval" | "Approved" | "Rejected">("All")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(18)
  const [totalPartners, setTotalPartners] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [decisionPartner, setDecisionPartner] = useState<HQIndustryPartner | null>(null)
  const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve")
  const [decisionComment, setDecisionComment] = useState("")
  const [submittingDecision, setSubmittingDecision] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<HQIndustryPartner | null>(null)
  const [allocationPartner, setAllocationPartner] = useState<HQIndustryPartner | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [partnerDetails, setPartnerDetails] = useState<HQPartnerDetails | null>(null)
  const [deleteDetails, setDeleteDetails] = useState<HQPartnerDetails | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)
  const fetchSequence = useRef(0)

  const fetchPartners = useCallback(async () => {
    const sequence = ++fetchSequence.current
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("includeAll", "1")
      if (query.trim()) params.set("q", query.trim())
      if (statusFilter !== "All") params.set("approvalStatus", statusFilter)
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))

      const res = await authFetch(`/api/industry-partners?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch industry partners")
      const data = await res.json() as HQIndustryPartnersResponse
      if (sequence !== fetchSequence.current) return
      setPartners(Array.isArray(data?.items) ? data.items : [])
      setTotalPartners(typeof data?.total === "number" ? data.total : 0)
      setTotalPages(typeof data?.totalPages === "number" ? data.totalPages : 0)
      setSummary(data?.summary || { total: 0, pending: 0, approved: 0, rejected: 0 })
    } catch (error) {
      if (sequence !== fetchSequence.current) return
      console.error("Error fetching HQ industry partners:", error)
      toast.error("Failed to load industry partners")
      setPartners([])
      setTotalPartners(0)
      setTotalPages(0)
      setSummary({ total: 0, pending: 0, approved: 0, rejected: 0 })
    } finally {
      if (sequence === fetchSequence.current) setLoading(false)
    }
  }, [authFetch, page, pageSize, query, statusFilter])

  useEffect(() => {
    fetchPartners()
  }, [fetchPartners])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter])

  const openDecision = (partner: HQIndustryPartner, type: "approve" | "reject") => {
    setDecisionPartner(partner)
    setDecisionType(type)
    setDecisionComment("")
  }

  const submitDecision = async () => {
    if (!decisionPartner) return
    setSubmittingDecision(true)
    try {
      const endpoint = decisionType === "approve"
        ? `/api/industry-partners/${decisionPartner._id}/hq-approve`
        : `/api/industry-partners/${decisionPartner._id}/hq-reject`
      const res = await authFetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalComment: decisionComment.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to update approval")
      toast.success(decisionType === "approve" ? "Partner approved" : "Partner rejected")
      setDecisionPartner(null)
      await fetchPartners()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update approval")
    } finally {
      setSubmittingDecision(false)
    }
  }

  const createPortalAccount = async (partner: HQIndustryPartner) => {
    if (!partner.contactEmail) {
      toast.error("Partner missing contact email")
      return
    }
    try {
      const res = await authFetch(`/api/industry-partners/${partner._id}/create-account`, { method: "POST" })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to create portal account")
      toast.success("Portal account created", {
        description: "A secure setup link has been issued to the partner email address.",
        duration: 10000,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create portal account")
    }
  }

  const isApprovedPartner = (partner: HQIndustryPartner) => !partner.approvalStatus || partner.approvalStatus === "Approved"

  const openDetails = async (partner: HQIndustryPartner) => {
    setDetailsOpen(true)
    setDetailsLoading(true)
    setPartnerDetails(null)
    try {
      const response = await authFetch(`/api/industry-partners/${partner._id}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Unable to load partner details')
      setPartnerDetails(payload as HQPartnerDetails)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load partner details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const openEdit = (partner: HQPartnerRecord) => {
    setDetailsOpen(false)
    setEditingPartner(partner as HQIndustryPartner)
    setRegistrationOpen(true)
  }

  const openDelete = (details: HQPartnerDetails) => {
    setDeleteDetails(details)
    setDeleteConfirmation('')
  }

  const deletePartner = async () => {
    if (!deleteDetails || deleteConfirmation !== deleteDetails.partner.name) return
    setDeleting(true)
    try {
      const response = await authFetch(`/api/industry-partners/${deleteDetails.partner._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationName: deleteConfirmation }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Unable to delete partner')
      toast.success('Partner permanently deleted', { description: `${deleteDetails.partner.name} was unused and has been removed from the registry.` })
      setDeleteDetails(null)
      setDetailsOpen(false)
      setPartnerDetails(null)
      if (partners.length === 1 && page > 1) setPage(current => current - 1)
      else await fetchPartners()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete partner')
    } finally {
      setDeleting(false)
    }
  }

  const handleRegistrationSuccess = async () => {
    setRegistrationOpen(false)
    setStatusFilter("All")
    setPage(1)
    toast.success("Partner registered and approved", {
      description: "The partner is now visible to regional and institution portals in its region.",
    })
    await fetchPartners()
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">HQ Industry Partner Registry</h2>
          <p className="text-muted-foreground mt-1">Review every registered partner and approve new submissions before they enter the placement network.</p>
        </div>
        {user?.role === 'SuperAdmin' && <div className="flex flex-wrap gap-3"><PartnerBulkRegistration onImported={fetchPartners} /><Button
          type="button"
          onClick={() => { setEditingPartner(null); setRegistrationOpen(true) }}
          className="h-12 rounded-2xl bg-[#FFB800] px-6 font-black text-gray-900 shadow-lg shadow-[#FFB800]/20 hover:bg-[#FFD700]"
        >
          <Plus className="mr-2 h-5 w-5" /> Register Partner
        </Button></div>}
      </div>

      <PartnerInsights />
      <PartnerChangeQueue onChange={() => void fetchPartners()} />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[2rem] border-gray-100 shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Total</p><p className="text-3xl font-black text-gray-900 mt-1">{summary.total}</p></CardContent></Card>
        <Card className="rounded-[2rem] border-amber-200 shadow-lg bg-amber-50"><CardContent className="p-5"><p className="text-sm text-amber-700">Pending HQ</p><p className="text-3xl font-black text-amber-700 mt-1">{summary.pending}</p></CardContent></Card>
        <Card className="rounded-[2rem] border-emerald-200 shadow-lg bg-emerald-50"><CardContent className="p-5"><p className="text-sm text-emerald-700">Approved</p><p className="text-3xl font-black text-emerald-700 mt-1">{summary.approved}</p></CardContent></Card>
        <Card className="rounded-[2rem] border-rose-200 shadow-lg bg-rose-50"><CardContent className="p-5"><p className="text-sm text-rose-700">Rejected</p><p className="text-3xl font-black text-rose-700 mt-1">{summary.rejected}</p></CardContent></Card>
      </div>

      <Card className="rounded-[2rem] border-gray-100 shadow-xl">
        <CardHeader className="p-6 pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-black">Partner Applications</CardTitle>
              <CardDescription>Pending submissions stay out of operational partner lists until approved by HQ.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder="Search company, sector, contact..." className="pl-10 rounded-xl w-full sm:w-80" />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["All", "PendingHQApproval", "Approved", "Rejected"] as const).map((filter) => (
                  <Button
                    key={filter}
                    variant="outline"
                    onClick={() => setStatusFilter(filter)}
                    className={`rounded-xl ${statusFilter === filter ? "bg-gray-900 text-white hover:bg-gray-900" : ""}`}
                  >
                    {filter === "PendingHQApproval" ? "Pending HQ" : filter}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-3">
          {loading ? (
            <p className="text-center py-10 text-gray-400">Loading partner registry...</p>
          ) : partners.length === 0 ? (
            <p className="text-center py-10 text-gray-400">No partners match the current filters.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm font-medium text-gray-500">
                  Showing {partners.length === 0 ? 0 : ((page - 1) * pageSize) + 1}
                  {" "}-{" "}
                  {Math.min(page * pageSize, totalPartners)}
                  {" "}of{" "}
                  <span className="font-bold text-gray-900">{totalPartners}</span> partners
                </p>
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <span className="min-w-[120px] text-center text-sm font-semibold text-gray-600">
                    Page {page} of {Math.max(totalPages, 1)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setPage((prev) => Math.min(prev + 1, Math.max(totalPages, 1)))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
              {partners.map((partner) => {
                const normalizedApprovalStatus = partner.approvalStatus || "Approved"
                const approvalTone = normalizedApprovalStatus === "Approved"
                  ? "bg-emerald-100 text-emerald-700"
                  : normalizedApprovalStatus === "Rejected"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-700"

                return (
                  <div key={partner._id} className="rounded-[1.75rem] border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="p-3 rounded-2xl bg-amber-50"><Building2 className="h-5 w-5 text-amber-600" /></div>
                          <div>
                            <h3 className="text-xl font-black text-gray-900">{partner.name}</h3>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{partner.partnerType === 'MasterCraftPerson' ? 'MCP' : (partner.partnerType || 'Registered company').replace(/([a-z])([A-Z])/g, '$1 $2')}</span><span className={`rounded-full px-2.5 py-1 ${partner.locationVerificationStatus === 'GPSVerified' ? 'bg-emerald-100 text-emerald-700' : partner.locationVerificationStatus === 'NotApplicableMobile' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{partner.locationVerificationStatus === 'GPSVerified' ? 'GPS verified' : partner.locationVerificationStatus === 'NotApplicableMobile' ? 'Mobile evidence' : 'GPS pending'}</span></div>
                            <p className="text-sm text-gray-500 font-medium">{partner.sector} • {partner.region}</p>
                          </div>
                          <Badge className={`${approvalTone} border-0`}>
                            {normalizedApprovalStatus === "PendingHQApproval" ? "Pending HQ Approval" : normalizedApprovalStatus}
                          </Badge>
                          <Badge className={`${partner.status === "Active" ? "bg-slate-100 text-slate-700" : "bg-gray-200 text-gray-700"} border-0`}>
                            {partner.status}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          {partner.contactPerson ? <span>{partner.contactPerson}</span> : null}
                          {partner.contactEmail ? <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" /> {partner.contactEmail}</span> : null}
                          <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {partner.location || partner.region}</span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3 text-sm">
                          <div className="rounded-2xl bg-gray-50 p-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Submitted By</p>
                            <p className="mt-2 font-bold text-gray-800">{partner.addedBy?.name || "Unknown"}</p>
                            <p className="text-gray-500">{partner.addedBy?.role || "N/A"}{partner.addedBy?.institution ? ` • ${partner.addedBy.institution}` : ""}</p>
                          </div>
                          <div className="rounded-2xl bg-gray-50 p-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Requested</p>
                            <p className="mt-2 font-bold text-gray-800">{partner.approvalRequestedAt ? formatDistanceToNow(new Date(partner.approvalRequestedAt), { addSuffix: true }) : "N/A"}</p>
                            <p className="text-gray-500">{partner.usedSlots || 0} / {partner.totalSlots || 0} slots used</p>
                          </div>
                          <div className="rounded-2xl bg-gray-50 p-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">HQ Review</p>
                            <p className="mt-2 font-bold text-gray-800">{partner.approvalReviewedBy?.name || "Awaiting review"}</p>
                            <p className="text-gray-500">{partner.approvalReviewedAt ? formatDistanceToNow(new Date(partner.approvalReviewedAt), { addSuffix: true }) : "No decision yet"}</p>
                          </div>
                        </div>

                        {partner.approvalComment ? (
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">HQ Comment</p>
                            <p className="mt-2 text-sm text-slate-700">{partner.approvalComment}</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 xl:w-48">
                        <Button variant="outline" className="rounded-xl" onClick={() => void openDetails(partner)}><Eye className="mr-2 h-4 w-4" /> View Details</Button>
                        <Button variant="outline" onClick={() => setAllocationPartner(partner)}>Reserved Slots</Button>
                        {user?.role === 'SuperAdmin' && <Button variant="outline" onClick={() => { setEditingPartner(partner); setRegistrationOpen(true) }}>Edit Partner / GPS</Button>}
                        {canApproveHQ(user?.role) && partner.approvalStatus === "PendingHQApproval" ? (
                          <>
                            <Button onClick={() => openDecision(partner, "approve")} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                            </Button>
                            <Button onClick={() => openDecision(partner, "reject")} variant="outline" className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50">
                              <XCircle className="mr-2 h-4 w-4" /> Reject
                            </Button>
                          </>
                        ) : null}
                        {user?.role === 'SuperAdmin' && <Button
                          onClick={() => createPortalAccount(partner)}
                          variant="outline"
                          disabled={!isApprovedPartner(partner) || partner.status !== "Active"}
                          className="rounded-xl"
                        >
                          <UserPlus className="mr-2 h-4 w-4" /> Portal
                        </Button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={registrationOpen} onOpenChange={setRegistrationOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-none bg-white p-0 sm:max-w-[640px]">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">{editingPartner ? 'Edit Industry Partner' : 'Register Industry Partner'}</DialogTitle>
              <DialogDescription>
                {editingPartner ? 'Update partner details and workplace coordinates for future placements.' : 'HQ registrations are approved immediately and become visible to regional and institution portals in the selected region.'}
              </DialogDescription>
            </DialogHeader>
            <IndustryPartnerForm initialData={editingPartner || undefined} onSuccess={editingPartner ? async () => { setRegistrationOpen(false); setEditingPartner(null); toast.success('Partner updated'); await fetchPartners() } : handleRegistrationSuccess} />
          </div>
        </DialogContent>
      </Dialog>
      {allocationPartner && <PartnerSlotAllocations partner={allocationPartner} open={Boolean(allocationPartner)} onOpenChange={value => { if (!value) setAllocationPartner(null) }} onChanged={() => void fetchPartners()} />}

      <HQPartnerDetailsDialog
        open={detailsOpen}
        loading={detailsLoading}
        details={partnerDetails}
        onOpenChange={(open) => { setDetailsOpen(open); if (!open) setPartnerDetails(null) }}
        onEdit={openEdit}
        onDelete={openDelete}
        canManage={user?.role === 'SuperAdmin'}
      />

      <Dialog open={Boolean(deleteDetails)} onOpenChange={(open) => { if (!open && !deleting) { setDeleteDetails(null); setDeleteConfirmation('') } }}>
        <DialogContent className="rounded-[2rem] border-none bg-white sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-rose-50 p-2.5"><AlertTriangle className="h-5 w-5 text-rose-600" /></div>
              <DialogTitle>Permanently delete partner</DialogTitle>
            </div>
            <DialogDescription>
              This is available only for an unused record with no operational or review history. The deletion is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          {deleteDetails ? <div className="space-y-4">
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-900">
              Enter <span className="font-black">{deleteDetails.partner.name}</span> exactly to confirm.
            </div>
            <div>
              <label htmlFor="delete-partner-confirmation" className="mb-2 block text-sm font-bold text-slate-700">Partner name</label>
              <Input id="delete-partner-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" disabled={deleting} />
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="rounded-xl" onClick={() => setDeleteDetails(null)} disabled={deleting}>Cancel</Button>
              <Button className="rounded-xl bg-rose-600 text-white hover:bg-rose-700" onClick={() => void deletePartner()} disabled={deleting || deleteConfirmation !== deleteDetails.partner.name}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete permanently
              </Button>
            </div>
          </div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decisionPartner)} onOpenChange={(open) => !open && setDecisionPartner(null)}>
        <DialogContent className="rounded-[2rem] border-none bg-white">
          <DialogHeader>
            <DialogTitle>{decisionType === "approve" ? "Approve Partner" : "Reject Partner"}</DialogTitle>
            <DialogDescription>
              {decisionPartner ? `${decisionType === "approve" ? "Approve" : "Reject"} ${decisionPartner.name} for use across the platform.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              placeholder={decisionType === "approve" ? "Optional approval note" : "Reason for rejection"}
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => setDecisionPartner(null)}>Cancel</Button>
              <Button
                onClick={submitDecision}
                disabled={submittingDecision}
                className={`rounded-xl ${decisionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"} text-white`}
              >
                {decisionType === "approve" ? <Clock3 className="mr-2 h-4 w-4" /> : <XCircle className="mr-2 h-4 w-4" />}
                {decisionType === "approve" ? "Approve Partner" : "Reject Partner"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
