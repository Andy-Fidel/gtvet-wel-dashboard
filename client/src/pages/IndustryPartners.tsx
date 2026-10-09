import { useState, useEffect } from "react"
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GHANA_REGIONS, INDUSTRY_SECTORS } from '@/lib/constants'
import { UnifiedPlacementForm } from './UnifiedPlacementForm'
import { useAuth } from "@/context/AuthContext"
import { RefreshCw, Plus, Building2, MapPin, Phone, Mail, Link as LinkIcon, BarChart2, UserPlus, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/lib/toast"
import { IndustryPartnerForm } from "./IndustryPartnerForm"
import { PartnerChangeForm, PartnerChangeQueue, PartnerRelationship } from '@/components/PartnerChanges'
import { PartnerSlotAllocations } from '@/components/PartnerSlotAllocations'
import { SearchPartnerDialog } from "@/components/SearchPartnerDialog"
import type { IndustryPartner as SharedIndustryPartner } from "@/types/models"

export type IndustryPartner = SharedIndustryPartner & {
  mouDocumentUrl?: string;
}

export default function IndustryPartners() {
  const { user } = useAuth()
  return <IndustryPartnerDirectory key={`${user?._id}:${user?.institution}:${user?.role}`} />
}

function IndustryPartnerDirectory() {
  const [partners, setPartners] = useState<IndustryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<IndustryPartner | null>(null)
  const [changePartner, setChangePartner] = useState<IndustryPartner | null>(null)
  const [relationshipPartner, setRelationshipPartner] = useState<IndustryPartner | null>(null)
  const [allocationPartner, setAllocationPartner] = useState<IndustryPartner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const { authFetch, user } = useAuth()
  const institutionDirectory = ['Admin', 'Manager', 'Staff'].includes(user?.role || '')
  const [tab, setTab] = useState('browse')
  const [region, setRegion] = useState<string | null>(null)
  const [institutionRegion, setInstitutionRegion] = useState(user?.region || '')
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sector, setSector] = useState('')
  const [directorySectors, setDirectorySectors] = useState<string[]>([...INDUSTRY_SECTORS])
  const [availableOnly, setAvailableOnly] = useState(false)
  const [detailsPartner, setDetailsPartner] = useState<IndustryPartner | null>(null)
  const [placementPartner, setPlacementPartner] = useState<IndustryPartner | null>(null)
  const selectedRegion = region ?? institutionRegion
  useEffect(() => {
    const timer = setTimeout(() => { setSearchQuery(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])
  const isApprovedPartner = (partner: IndustryPartner) => !partner.approvalStatus || partner.approvalStatus === 'Approved'

  useEffect(() => {
    let cancelled = false
    const fetchPartners = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const includeAll = !institutionDirectory && ['SuperAdmin', 'RegionalAdmin'].includes(user?.role || '')
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
        if (includeAll) params.set('includeAll', '1')
        if (institutionDirectory) {
          params.set('directory', '1')
          params.set('view', tab === 'submissions' ? 'submissions' : 'browse')
          if (tab === 'browse') {
            if (region !== null) params.set('region', region)
            if (sector) params.set('sector', sector)
            if (availableOnly) params.set('availableOnly', '1')
            if (searchQuery) params.set('q', searchQuery)
          }
        }
        const res = await authFetch(`/api/industry-partners?${params}`)
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        if (cancelled) return
        if (!Array.isArray(data.items)) throw new Error('Invalid partner response')
        if (page > Math.max(data.totalPages, 1)) {
          setPage(Math.max(data.totalPages, 1))
          return
        }
        setPartners(data.items)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        if (typeof data.institutionRegion === 'string') setInstitutionRegion(data.institutionRegion)
        if (Array.isArray(data.sectors)) setDirectorySectors(data.sectors.filter((value: unknown): value is string => typeof value === 'string'))
      } catch (err) {
        if (cancelled) return
        setLoadError(true)
        setPartners([])
        console.error("Error fetching partners:", err)
        toast.error("Failed to load industry partners")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPartners()
    return () => { cancelled = true }
  }, [refreshKey, authFetch, user?.role, user?.institution, user?.region, page, pageSize, institutionDirectory, tab, region, sector, availableOnly, searchQuery])

  const handleSuccess = () => {
    setOpen(false)
    setEditingPartner(null)
    setRefreshKey(prev => prev + 1)
    if (editingPartner) {
      toast.success(editingPartner.approvalStatus === 'Rejected' && editingPartner.canResubmit ? 'Partner resubmitted for HQ approval' : 'Partner updated')
    } else {
      toast.success(user?.role === 'SuperAdmin' ? "Partner created" : "Partner submitted for HQ approval")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this partner?")) return;
    try {
      const res = await authFetch(`/api/industry-partners/${id}`, { method: 'DELETE' })
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to delete') }
      setRefreshKey(prev => prev + 1)
      toast.success("Industry partner deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error deleting partner')
    }
  }

  const handleCreateAccount = async (id: string, email?: string) => {
    if (!email) {
        toast.error("Partner missing contact email", { description: "An email is required to create a portal account." })
        return;
    }
    try {
      toast.info("Creating account...")
      const res = await authFetch(`/api/industry-partners/${id}/create-account`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to create account")

      toast.success("Account created", {
        description: "A secure setup link has been issued to the partner email address.",
        duration: 10000,
      })
    } catch (err) {
      const e = err as Error;
      toast.error("Error", { description: e.message })
    }
  }

  return (
    <Tabs value={tab} onValueChange={value => { setTab(value); setPage(1) }} className={institutionDirectory ? 'mx-auto w-full max-w-6xl space-y-6 pb-10' : 'flex-1 space-y-8 p-4 sm:p-8 flex flex-col items-center max-w-7xl mx-auto w-full'}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700"><Building2 aria-hidden="true" className="h-5 w-5" /> {institutionDirectory ? 'Institution placement partners' : 'Placement partners'}</div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Industry Partners</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{institutionDirectory ? 'Find approved partners for your learners anywhere in Ghana.' : 'Manage companies providing placement opportunities.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh partners'}</Button>
          {['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'].includes(user?.role || '') && <Button data-help-id="industry-partners-add" onClick={() => { setEditingPartner(null); setSearchOpen(true); }} className="bg-[#FFB800] text-slate-950 hover:bg-[#E6A600]"><Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Add Partner</Button>}
        </div>
      </header>

      {institutionDirectory && <Card className="overflow-hidden rounded-3xl">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><Building2 aria-hidden="true" className="h-6 w-6" /></div>
              <div role="status" aria-live="polite">
                <h2 className="text-lg font-bold text-slate-950">{tab === 'submissions' ? 'Your institution’s submissions' : 'Explore placement opportunities'}</h2>
                <p className="mt-1 text-sm text-slate-600">{tab === 'submissions' ? 'Track partner approvals, corrections and institution relationships.' : institutionRegion ? `Your institution’s region: ${institutionRegion}. Browse other regions to find the right placement.` : 'Browse approved partners across Ghana.'}</p>
                <p className="mt-1 text-xs text-slate-500">Capacity is for today and is checked again for your placement dates.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit">{tab === 'submissions' ? 'Institution submissions' : selectedRegion && selectedRegion !== 'all' ? selectedRegion : 'All regions'}</Badge>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            {[
              ['Partners found', total],
              ['Available on this page', partners.filter(partner => partner.status === 'Active' && isApprovedPartner(partner) && (partner.institutionCapacity?.availableSlots ?? 0) > 0).length],
              ['Slots on this page', partners.reduce((sum, partner) => sum + (partner.status === 'Active' && isApprovedPartner(partner) ? partner.institutionCapacity?.availableSlots ?? 0 : 0), 0)],
            ].map(([label, count]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-slate-600">{label}</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{loading || loadError ? '—' : count}</dd></div>)}
          </dl>
        </CardContent>
      </Card>}

      {institutionDirectory && <TabsList className="h-auto max-w-full flex-wrap justify-start rounded-xl bg-slate-100 p-1"><TabsTrigger value="browse">Browse partners</TabsTrigger><TabsTrigger value="submissions">My submissions &amp; changes</TabsTrigger></TabsList>}
      <TabsContent value={tab} className="w-full space-y-6">
      {institutionDirectory && tab === 'browse' && <section aria-label="Partner directory filters" className="w-full rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-0 basis-full sm:basis-0 sm:min-w-64 flex-1 text-sm font-bold">Browse by region<select className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-3 font-medium" value={selectedRegion || 'all'} onChange={event => { setRegion(event.target.value); setPage(1) }}>
            <option value="all">All regions</option>{GHANA_REGIONS.map(name => <option key={name}>{name}</option>)}
          </select></label>
          <div className="flex-1 min-w-0 basis-full sm:basis-0 sm:min-w-64 text-sm text-gray-600">{institutionRegion && <span className="inline-block mb-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{selectedRegion === institutionRegion ? 'Your institution’s region' : `Your institution: ${institutionRegion}`}</span>}<p>{institutionRegion ? `${institutionRegion} is selected by default. Switch regions to explore other partners.` : 'Select a region to explore approved partners across Ghana.'}</p></div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Quick region selection">{[...new Set([institutionRegion, 'Greater Accra', 'Central', 'Eastern', 'Western'])].filter(Boolean).map(name => <Button key={name} variant="outline" aria-pressed={selectedRegion === name} className={selectedRegion === name ? 'bg-amber-50 border-amber-400' : ''} onClick={() => { setRegion(name); setPage(1) }}>{name}</Button>)}<Button variant="outline" aria-pressed={selectedRegion === 'all'} onClick={() => { setRegion('all'); setPage(1) }}>All regions</Button></div>
        <div className="flex flex-wrap items-center gap-3">
          <Input className="min-w-0 basis-full sm:basis-0 sm:min-w-56 flex-1" aria-label="Search partner name or town" placeholder="Search partner name or town" value={search} maxLength={160} onChange={event => setSearch(event.target.value)} />
          <label className="sr-only" htmlFor="partner-sector">Sector</label><select id="partner-sector" className="w-full sm:w-auto max-w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" value={sector} onChange={event => { setSector(event.target.value); setPage(1) }}><option value="">All sectors</option>{[...new Set([...directorySectors, ...(sector ? [sector] : [])])].map(name => <option key={name}>{name}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={availableOnly} onChange={event => { setAvailableOnly(event.target.checked); setPage(1) }} />With available slots</label>
        </div>
        <p className="text-xs text-gray-500">Availability is for today. Capacity and permissions are checked again for the placement dates you choose.</p>
      </section>}
      {(!institutionDirectory || tab === 'submissions') && ['Admin', 'Manager', 'Staff', 'SuperAdmin', 'RegionalAdmin'].includes(user?.role || '') && <PartnerChangeQueue onChange={() => setRefreshKey(key => key + 1)} />}
      {institutionDirectory && <h3 className="w-full text-lg font-bold">{tab === 'submissions' ? 'Your institution’s submissions' : selectedRegion && selectedRegion !== 'all' ? `Partners in ${selectedRegion}` : 'Partners across Ghana'}{!loading && !loadError && <span className="ml-3 text-sm font-normal text-gray-500">{total} {tab === 'browse' ? 'approved ' : ''}partner{total === 1 ? '' : 's'}</span>}</h3>}
      <Dialog open={!!placementPartner} onOpenChange={value => { if (!value) setPlacementPartner(null) }}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Placement with {placementPartner?.name}</DialogTitle><DialogDescription>Select learners and placement dates. Existing approval and capacity checks apply.</DialogDescription></DialogHeader>{placementPartner && <UnifiedPlacementForm initialData={{ partner: placementPartner._id }} onSuccess={() => { setPlacementPartner(null); setRefreshKey(key => key + 1) }} />}</DialogContent></Dialog>
      <Dialog open={!!detailsPartner} onOpenChange={value => { if (!value) setDetailsPartner(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{detailsPartner?.name}</DialogTitle><DialogDescription>Partner contact and workplace information</DialogDescription></DialogHeader>{detailsPartner && <div className="space-y-4 text-sm">
        <p>{detailsPartner.sector} · {detailsPartner.town || detailsPartner.location || detailsPartner.region} · {detailsPartner.region}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt>Contact person</dt><dd>{detailsPartner.contactPerson || 'Not recorded'}</dd><dt>Phone</dt><dd>{detailsPartner.contactPhone || 'Not recorded'}</dd><dt>Email</dt><dd>{detailsPartner.contactEmail || 'Not recorded'}</dd><dt>Location type</dt><dd>{detailsPartner.locationVerificationStatus === 'TownSelected' ? 'Town location · approximate 5 km radius' : detailsPartner.locationVerificationStatus === 'GPSVerified' ? 'Actual workplace · 500 m radius' : 'Location verification pending'}</dd></dl>
        {detailsPartner.website && <a className="block text-blue-700 underline" target="_blank" rel="noreferrer" href={detailsPartner.website}>Website</a>}
        {detailsPartner.mouDocumentUrl && <a className="block text-blue-700 underline" target="_blank" rel="noreferrer" href={detailsPartner.mouDocumentUrl}>View MoU</a>}
        <div className="flex flex-wrap gap-2">{detailsPartner.canRequestChanges && <Button variant="outline" onClick={() => { setChangePartner(detailsPartner); setDetailsPartner(null) }}>Request changes</Button>}<Button variant="outline" onClick={() => { setRelationshipPartner(detailsPartner); setDetailsPartner(null) }}>Institution details</Button><Button variant="outline" onClick={() => { setAllocationPartner(detailsPartner); setDetailsPartner(null) }}>Reserved slots</Button></div>
      </div>}</DialogContent></Dialog>
      <Dialog open={!!changePartner} onOpenChange={open => { if (!open) setChangePartner(null) }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Request changes: {changePartner?.name}</DialogTitle><DialogDescription>Submit corrections for institution and HQ review.</DialogDescription></DialogHeader>{changePartner && <PartnerChangeForm partner={{ ...changePartner }} onDone={() => setChangePartner(null)} />}</DialogContent></Dialog>
      <Dialog open={!!relationshipPartner} onOpenChange={open => { if (!open) setRelationshipPartner(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{relationshipPartner?.name}: institution details</DialogTitle><DialogDescription>Contacts and notes for your institution.</DialogDescription></DialogHeader>{relationshipPartner && <PartnerRelationship partner={relationshipPartner} onDone={() => setRelationshipPartner(null)} />}</DialogContent></Dialog>
      {allocationPartner && <PartnerSlotAllocations partner={allocationPartner} open={Boolean(allocationPartner)} onOpenChange={value => { if (!value) setAllocationPartner(null) }} onChanged={() => setRefreshKey(key => key + 1)} />}
      <SearchPartnerDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onLinkSuccess={() => setRefreshKey(prev => prev + 1)}
        onRegisterNew={() => {
          setEditingPartner(null);
          setOpen(true);
        }}
      />

      <Dialog open={open} onOpenChange={(val) => {
        setOpen(val)
        if (!val) setEditingPartner(null)
      }}>
        <DialogContent className="sm:max-w-[600px] bg-white border-none rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh] p-0 [&>button]:text-gray-500 hover:[&>button]:text-gray-900 [&>button]:bg-gray-100 hover:[&>button]:bg-gray-200">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">{editingPartner?.approvalStatus === 'Rejected' && editingPartner.canResubmit ? 'Correct and resubmit partner' : editingPartner ? 'Edit Partner' : 'Register New Partner'}</DialogTitle>
              <DialogDescription className="font-medium text-gray-500">
                Enter company details and capacity.
              </DialogDescription>
            </DialogHeader>
            <IndustryPartnerForm onSuccess={handleSuccess} initialData={editingPartner || undefined} resubmit={editingPartner?.approvalStatus === 'Rejected' && editingPartner.canResubmit} approvalVersion={editingPartner?.approvalVersion} />
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div aria-label="Loading partners" className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-72 rounded-3xl" />)}</div>
      ) : loadError ? (
        <div role="alert" className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p>Unable to load partners.</p>
          <Button variant="outline" className="mt-3" onClick={() => setRefreshKey(value => value + 1)}>Retry</Button>
        </div>
      ) : partners.length === 0 ? (
        <div className="w-full rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center sm:p-12">
          <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black text-gray-500 tracking-tight">No partners found</h3>
          <p className="text-gray-400 mt-2 font-medium">{institutionDirectory ? tab === 'browse' ? 'Try another region or clear your search and filters.' : 'Your institution’s partner submissions will appear here.' : 'Add some industry partners to get started.'}</p>
        </div>
      ) : (
        <div data-help-id="industry-partners-grid" className={institutionDirectory ? 'grid w-full gap-4 md:grid-cols-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full'}>
          {partners.map(partner => (
            <Card key={partner._id} className={institutionDirectory ? 'rounded-3xl bg-white shadow-sm overflow-hidden' : 'bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-[2rem] overflow-hidden group'}>
              {!institutionDirectory && <div className="h-2 w-full bg-[#FFB800]" />}
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-3">
                  <div>
                     <h3 className="font-bold text-slate-950 leading-tight break-words">{partner.name}</h3>
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 bg-gray-100 text-gray-600 mt-2 uppercase tracking-wide">
                        {partner.sector}
                     </span>
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 bg-blue-50 text-blue-700 mt-2 ml-2">
                       {partner.partnerType === 'MasterCraftPerson' ? 'MCP' : (partner.partnerType || 'Registered company').replace(/([a-z])([A-Z])/g, '$1 $2')}
                     </span>
                     <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 mt-2 ml-2 ${partner.locationVerificationStatus === 'GPSVerified' ? 'bg-emerald-100 text-emerald-700' : partner.locationVerificationStatus === 'NotApplicableMobile' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                       {partner.locationVerificationStatus === 'TownSelected' ? 'Town location selected' : partner.locationVerificationStatus === 'GPSVerified' ? 'Workplace location recorded' : partner.locationVerificationStatus === 'NotApplicableMobile' ? 'Mobile evidence' : 'GPS pending'}
                     </span>

                     {!institutionDirectory && partner.approvalStatus && partner.approvalStatus !== 'Approved' && (
                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 mt-2 ml-2 uppercase tracking-wide ${
                         partner.approvalStatus === 'PendingHQApproval'
                           ? 'bg-amber-100 text-amber-700'
                           : 'bg-rose-100 text-rose-700'
                       }`}>
                         {partner.approvalStatus === 'PendingHQApproval' ? 'Pending HQ' : 'Rejected'}
                       </span>
                     )}
                  </div>
                  {institutionDirectory ? <Badge variant="outline" className={partner.status !== 'Active' || !isApprovedPartner(partner) || partner.institutionCapacity?.availableSlots === 0 ? 'shrink-0 bg-amber-100 text-amber-900 border-amber-200' : 'shrink-0 bg-emerald-100 text-emerald-800 border-emerald-200'}>{!isApprovedPartner(partner) ? partner.approvalStatus === 'Rejected' ? 'Rejected' : 'Pending HQ' : partner.status !== 'Active' ? 'Inactive' : partner.institutionCapacity?.availableSlots === 0 ? 'Full' : 'Approved'}</Badge> : partner.status === 'Active' ? (
                     <div className="h-3 w-3 rounded-full bg-emerald-400 border-2 border-white shadow-sm" title="Active"></div>
                  ) : (
                     <div className="h-3 w-3 rounded-full bg-red-400 border-2 border-white shadow-sm" title="Inactive"></div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="truncate" title={partner.region}>{partner.town || partner.location ? `${partner.town || partner.location}, ${partner.region}` : partner.region}</span>
                    </div>
                    {partner.contactPhone && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{partner.contactPhone}</span>
                        </div>
                    )}
                    {partner.contactEmail && (!institutionDirectory || tab === 'submissions') && (
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="truncate" title={partner.contactEmail}>{partner.contactEmail}</span>
                        </div>
                    )}
                    {partner.website && (!institutionDirectory || tab === 'submissions') && (
                       <div className="flex items-center gap-2">
                           <LinkIcon className="h-4 w-4 text-gray-400" />
                           <a href={partner.website} target="_blank" rel="noreferrer" className="truncate text-blue-500 hover:underline">Website</a>
                       </div>
                    )}
                    {partner.mouDocumentUrl && (
                       <div className="flex items-center gap-2">
                           <FileText className="h-4 w-4 text-green-500" />
                           <a href={partner.mouDocumentUrl} target="_blank" rel="noreferrer" className="truncate text-green-600 font-bold hover:underline">View MoU</a>
                       </div>
                    )}
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs">
                    <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-[#FFB800]"/> {partner.institutionCapacity ? 'Available to your institution' : 'Capacity'}</span>
                         <span className="text-xl font-black text-gray-900">{partner.institutionCapacity?.availableSlots ?? `${partner.usedSlots} / ${partner.totalSlots}`}</span>
                    </div>
                    {!partner.institutionCapacity && <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                         className={`h-1.5 rounded-full transition-all duration-500 ${partner.usedSlots >= partner.totalSlots ? 'bg-red-500' : 'bg-[#10b981]'}`}
                         style={{ width: `${partner.totalSlots > 0 ? Math.min((partner.usedSlots / partner.totalSlots) * 100, 100) : 0}%` }}
                        ></div>
                    </div>}
                    {partner.institutionCapacity && <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs"><span><strong className="block text-gray-900">{partner.institutionCapacity.reservedAvailable}</strong> reserved available</span><span><strong className="block text-gray-900">{partner.institutionCapacity.sharedAvailable}</strong> shared available</span></div>}
                </div>

                {partner.approvalStatus === 'Rejected' && partner.approvalComment && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><strong>HQ rejection reason:</strong> {partner.approvalComment}</p>}
                {partner.canResubmit && <Button variant="outline" size="sm" onClick={() => { setEditingPartner(partner); setOpen(true) }}>Correct and resubmit</Button>}
                {institutionDirectory && tab === 'browse' && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3"><Button variant="outline" className="flex-1" onClick={() => setDetailsPartner(partner)}>View details</Button><Button className="flex-1 bg-[#FFB800] text-gray-900 hover:bg-amber-400" disabled={partner.status !== 'Active' || !isApprovedPartner(partner) || partner.institutionCapacity?.availableSlots === 0} onClick={() => setPlacementPartner(partner)}>Use for placement</Button></div>}
                {(!institutionDirectory || tab === 'submissions') && ['Admin', 'Manager', 'Staff', 'RegionalAdmin'].includes(user?.role || '') && <div className="flex flex-wrap gap-2 border-t pt-3">{partner.canRequestChanges && <Button variant="outline" size="sm" disabled={!isApprovedPartner(partner)} onClick={() => setChangePartner(partner)}>Request changes</Button>}{user?.role !== 'RegionalAdmin' && <><Button variant="outline" size="sm" onClick={() => setRelationshipPartner(partner)}>Institution details</Button><Button variant="outline" size="sm" disabled={!isApprovedPartner(partner)} onClick={() => setAllocationPartner(partner)}>Reserved slots</Button></>}</div>}
                {(user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin') && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100 mt-4">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => handleCreateAccount(partner._id, partner.contactEmail)}
                           disabled={!isApprovedPartner(partner) || partner.status !== 'Active'}
                           className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 font-bold h-9"
                         >
                             <UserPlus className="h-4 w-4 mr-2" /> Portal
                         </Button>
                         {!partner.canResubmit && (user?.role === 'SuperAdmin' || partner.approvalStatus === 'PendingHQApproval') && <Button variant="outline" size="sm" onClick={() => { setEditingPartner(partner); setOpen(true); }} className="flex-1 hover:bg-[#FFB800]/10 hover:text-[#FFB800] border-gray-200 font-bold h-9">
                             Edit
                         </Button>}
                         {user?.role === 'SuperAdmin' && (
                             <Button variant="outline" size="sm" onClick={() => handleDelete(partner._id)} className="hover:bg-red-50 hover:text-red-500 border-gray-200 font-bold h-9 px-3">
                                 Delete
                             </Button>
                         )}
                    </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <nav aria-label="Industry partners pagination" className="flex flex-wrap items-center justify-between gap-4 w-full border-t border-gray-200 pt-5">
        <p className="text-sm text-gray-600" aria-live="polite">
          {loading ? 'Loading partners…' : loadError ? 'Partners unavailable' : total === 0 ? '0 partners' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} partners`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="partners-page-size" className="text-sm">Per page</label>
          <select id="partners-page-size" className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm" value={pageSize} disabled={loading} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>
            {[12, 24, 48, 96].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <Button variant="outline" disabled={loading || loadError || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span className="text-sm">Page {page} of {Math.max(totalPages, 1)}</span>
          <Button variant="outline" disabled={loading || loadError || page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </nav>
      </TabsContent>
    </Tabs>
  )
}
