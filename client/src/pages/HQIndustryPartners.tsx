import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock3, Download, Loader2, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react'
import { PartnerInsights } from '@/components/PartnerInsights'
import { PartnerChangeQueue } from '@/components/PartnerChanges'
import { PartnerSlotAllocations } from '@/components/PartnerSlotAllocations'
import { PendingSlotApprovals } from '@/components/PendingSlotApprovals'
import { HQPartnerDetailsDialog, type HQPartnerDetails, type HQPartnerRecord } from '@/components/HQPartnerDetailsDialog'
import { HQPartnerRegistryList } from '@/components/HQPartnerRegistryList'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { canApproveHQ } from '@/lib/rbac'
import { GHANA_REGIONS } from '@/lib/constants'
import { approvalLabels, attentionLabels, partnerTypeLabels, registryFilterLabels, sortLabels, locationLabel, partnerAttention } from '@/lib/hqPartnerRegistry'
import { downloadPartnerRegistry, partnerRegistryCsv, partnerRegistryPdf } from '@/lib/partnerRegistryExport'
import { toast } from '@/lib/toast'
import { IndustryPartnerForm } from './IndustryPartnerForm'
import { PartnerBulkRegistration } from './PartnerBulkRegistration'

type HQIndustryPartner = HQPartnerRecord
const FILTER_KEYS = ['q', 'approvalStatus', 'region', 'sector', 'partnerType', 'partnerStatus', 'attention', 'sort']
const PAGE_SIZE = 18
const ALL_LABELS: Record<string, string> = { approvalStatus: 'All approval states', region: 'All regions', sector: 'All sectors', partnerType: 'All partner types', partnerStatus: 'All operational states', attention: 'All records', sort: 'Newest added' }

export default function HQIndustryPartners() {
  const { authFetch, user } = useAuth()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const latestParams = useRef(searchParams)
  useEffect(() => { latestParams.current = searchParams }, [searchParams])
  const requestedTab = searchParams.get('tab') || 'registry'
  const activeTab = ['registry', 'insights', 'changes'].includes(requestedTab) || (requestedTab === 'slot-approvals' && user?.role === 'SuperAdmin') ? requestedTab : 'registry'
  const query = searchParams.get('q') || ''
  const statusFilter = searchParams.get('approvalStatus') || 'All'
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const params = new URLSearchParams({ includeAll: '1', registry: '1' })
  for (const key of FILTER_KEYS) { const value = searchParams.get(key); if (value) params.set(key, value) }
  const filterString = params.toString()
  const [queryInput, setQueryInput] = useState(query)
  const [partners, setPartners] = useState<HQIndustryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [totalPartners, setTotalPartners] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [sectors, setSectors] = useState<string[]>([])
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const exportInProgress = useRef(false)
  const [decisionPartner, setDecisionPartner] = useState<HQIndustryPartner | null>(null)
  const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve')
  const [decisionComment, setDecisionComment] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(false)
  const decisionInProgress = useRef(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<HQIndustryPartner | null>(null)
  const [allocationPartner, setAllocationPartner] = useState<HQIndustryPartner | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsTarget, setDetailsTarget] = useState<HQIndustryPartner | null>(null)
  const [detailsRevision, setDetailsRevision] = useState(0)
  const [partnerDetails, setPartnerDetails] = useState<HQPartnerDetails | null>(null)
  const detailsTrigger = useRef<HTMLElement | null>(null)
  const directoryRef = useRef<HTMLElement>(null)
  const [deleteDetails, setDeleteDetails] = useState<HQPartnerDetails | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const deleteInProgress = useRef(false)
  const [pendingAccounts, setPendingAccounts] = useState<Record<string, boolean>>({})
  const accountRequests = useRef(new Set<string>())

  const updateFilters = useCallback((values: Record<string, string>, replace = false) => {
    // Router navigations can overlap; compose rapid selections against the latest intent.
    const next = new URLSearchParams(latestParams.current)
    next.delete('page')
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    latestParams.current = next
    setSearchParams(next, { replace })
  }, [setSearchParams])

  useEffect(() => { setQueryInput(query) }, [query])
  useEffect(() => {
    if (queryInput.trim() === query) return
    const timeout = setTimeout(() => updateFilters({ q: queryInput.trim() }, true), 350)
    return () => clearTimeout(timeout)
  }, [queryInput, query, updateFilters])

  useEffect(() => {
    if (activeTab !== 'registry') return
    const controller = new AbortController()
    setLoading(true); setError('')
    let adjustingPage = false
    const load = async () => {
      try {
        const request = new URLSearchParams(filterString)
        request.set('page', String(page)); request.set('pageSize', String(PAGE_SIZE))
        const response = await authFetch(`/api/industry-partners?${request}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load the partner registry.')
        const payload = await response.json()
        if (controller.signal.aborted) return
        const lastPage = Math.max(1, payload.totalPages || 1)
        if (page > lastPage) { adjustingPage = true; updateFilters({ page: String(lastPage) }, true); return }
        setPartners(Array.isArray(payload.items) ? payload.items : [])
        setTotalPartners(payload.total || 0); setTotalPages(payload.totalPages || 0)
        setSummary(payload.summary || { total: 0, pending: 0, approved: 0, rejected: 0 })
        setSectors(Array.isArray(payload.sectors) ? payload.sectors : [])
        setLoaded(true)
      } catch (failure) {
        if (!controller.signal.aborted) { console.error('Registry load failed:', failure); setError('Unable to load partners. Previous results may be out of date. Please retry.') }
      } finally { if (!controller.signal.aborted && !adjustingPage) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [authFetch, filterString, page, revision, activeTab, updateFilters])

  useEffect(() => {
    if (!detailsOpen || !detailsTarget) return
    const controller = new AbortController()
    setDetailsLoading(true); setDetailsError(''); setPartnerDetails(null)
    const load = async () => {
      try {
        const response = await authFetch(`/api/industry-partners/${detailsTarget._id}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load partner details')
        const payload = await response.json()
        if (!controller.signal.aborted) setPartnerDetails(payload)
      } catch (failure) {
        if (!controller.signal.aborted) { console.error('Partner details failed:', failure); setDetailsError('Unable to load this partner record. Please retry.') }
      } finally { if (!controller.signal.aborted) setDetailsLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [authFetch, detailsOpen, detailsTarget, detailsRevision])

  const refreshPartners = useCallback(async () => {
    setRevision(value => value + 1)
    await client.invalidateQueries({ queryKey: ['partner-insights'] })
  }, [client])
  const inspect = (filters: Record<string, string>) => {
    setQueryInput(filters.q || '')
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      for (const key of [...FILTER_KEYS, 'page', 'tab']) next.delete(key)
      for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value)
      return next
    })
    directoryRef.current?.focus()
  }
  const openDetails = (partner: HQIndustryPartner, trigger: HTMLElement) => { detailsTrigger.current = trigger; setDetailsTarget(partner); setDetailsOpen(true) }
  const openEdit = (partner: HQPartnerRecord) => { setDetailsOpen(false); setEditingPartner(partner); setRegistrationOpen(true) }
  const openDelete = (details: HQPartnerDetails) => { setDeleteDetails(details); setDeleteConfirmation('') }
  const openDecision = (partner: HQIndustryPartner, type: 'approve' | 'reject') => { setDecisionPartner(partner); setDecisionType(type); setDecisionComment('') }
  const submitDecision = async () => {
    if (!decisionPartner || decisionInProgress.current || (decisionType === 'reject' && decisionComment.trim().length < 5)) return
    decisionInProgress.current = true; setSubmittingDecision(true)
    try {
      const endpoint = `/api/industry-partners/${decisionPartner._id}/hq-${decisionType}`
      const response = await authFetch(endpoint, { method: 'PUT', body: JSON.stringify({ approvalComment: decisionComment.trim(), sourceApprovalVersion: decisionPartner.approvalVersion || 0 }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) { if (response.status === 409) { setDecisionPartner(null); refreshPartners() }; throw new Error(payload.message || 'Unable to update approval') }
      setDecisionPartner(null); refreshPartners()
      toast.success(decisionType === 'approve' ? 'Partner approved' : 'Partner rejected')
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Unable to update approval') }
    finally { decisionInProgress.current = false; setSubmittingDecision(false) }
  }
  const createPortalAccount = async (partner: HQIndustryPartner) => {
    if (accountRequests.current.has(partner._id)) return
    accountRequests.current.add(partner._id); setPendingAccounts(current => ({ ...current, [partner._id]: true }))
    try {
      const response = await authFetch(`/api/industry-partners/${partner._id}/create-account`, { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Unable to create coordinator account. Review the account state before retrying.')
      toast.success('Coordinator account created. A setup link has been issued to the contact email.')
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Unable to create coordinator account') }
    finally { accountRequests.current.delete(partner._id); setPendingAccounts(current => ({ ...current, [partner._id]: false })); refreshPartners() }
  }
  const deletePartner = async () => {
    if (!deleteDetails || deleteConfirmation !== deleteDetails.partner.name || deleteInProgress.current) return
    deleteInProgress.current = true; setDeleting(true)
    try {
      const response = await authFetch(`/api/industry-partners/${deleteDetails.partner._id}`, { method: 'DELETE', body: JSON.stringify({ confirmationName: deleteConfirmation }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Unable to delete partner')
      setDeleteDetails(null); setDetailsOpen(false); setDetailsTarget(null); setPartnerDetails(null); refreshPartners()
      toast.success('Partner permanently deleted')
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Unable to delete partner') }
    finally { deleteInProgress.current = false; setDeleting(false) }
  }
  const handleRegistrationSuccess = () => { setRegistrationOpen(false); inspect({}); refreshPartners(); toast.success('Partner registered and approved') }
  const filterDescription = FILTER_KEYS.filter(key => !['q', 'approvalStatus'].includes(key) && searchParams.get(key)).map(key => `${registryFilterLabels[key] || 'Sort'}: ${attentionLabels[searchParams.get(key)!] || partnerTypeLabels[searchParams.get(key)!] || sortLabels[searchParams.get(key)!] || searchParams.get(key)}`).join(' | ')
  const exportPartners = async (format: 'csv' | 'pdf') => {
    if (exportInProgress.current) return
    exportInProgress.current = true; setExporting(format)
    try {
      const response = await authFetch(`/api/industry-partners?${filterString}`)
      if (!response.ok) throw new Error('Unable to load partners for export. Please try again.')
      const items: HQIndustryPartner[] = await response.json()
      if (!Array.isArray(items)) throw new Error('Unexpected partner export response. Please try again.')
      if (!items.length) { toast.info('No partners match the current filters.'); return }
      const blob = format === 'csv' ? new Blob([partnerRegistryCsv(items)], { type: 'text/csv;charset=utf-8;' }) : await partnerRegistryPdf(items, { query, status: statusFilter, extra: filterDescription })
      downloadPartnerRegistry(blob, format); toast.success(`Exported ${items.length} partners to ${format.toUpperCase()}`)
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Unable to export partners. Please try again.') }
    finally { exportInProgress.current = false; setExporting(null) }
  }
  const select = (key: string, label: string, values: Record<string, string>) => <div className="space-y-2"><label htmlFor={`registry-${key}`} className="block text-sm font-medium text-gray-700">{label}</label><Select value={(key === 'sort' && searchParams.get(key) === 'newest' ? '__all' : searchParams.get(key)) || '__all'} onValueChange={value => updateFilters({ [key]: value === '__all' ? '' : value })}><SelectTrigger id={`registry-${key}`} className="h-11 rounded-lg border-gray-200 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">{ALL_LABELS[key]}</SelectItem>{Object.entries(values).map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select></div>

  return <div className="flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h1 className="text-2xl font-semibold tracking-tight text-gray-900">HQ Industry Partner Registry</h1><p className="mt-1 text-sm text-gray-500">Find partners, review approval and location evidence, and manage the shared registry.</p></div>
      {user?.role === 'SuperAdmin' && <div className="flex flex-wrap gap-2"><PartnerBulkRegistration onImported={refreshPartners} /><Button onClick={() => { setEditingPartner(null); setRegistrationOpen(true) }} className="rounded-xl bg-[#FFB800] text-gray-900 hover:bg-[#e5a600]"><Plus aria-hidden="true" className="mr-2 h-4 w-4" />Register Partner</Button></div>}
    </header>
    <Tabs value={activeTab} onValueChange={value => setSearchParams(previous => { const next = new URLSearchParams(previous); if (value === 'registry') next.delete('tab'); else next.set('tab', value); return next })}>
      <TabsList aria-label="Partner Registry sections" className="mb-4 h-auto flex-wrap justify-start gap-1"><TabsTrigger value="registry">Partner Registry</TabsTrigger><TabsTrigger value="insights">Partner & industry insights</TabsTrigger><TabsTrigger value="changes">Change requests</TabsTrigger>{user?.role === 'SuperAdmin' && <TabsTrigger value="slot-approvals">Pending Slot Approvals</TabsTrigger>}</TabsList>
      <TabsContent value="registry" className="space-y-4">
        <section ref={directoryRef} tabIndex={-1} aria-label="Partner registry" aria-busy={loading} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900">Partners</h2><p className="mt-1 text-sm text-gray-500">Approval, operational status and placement availability are separate checks.</p></div><Button variant="outline" disabled={loading} onClick={refreshPartners}><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Refresh registry</Button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><label htmlFor="registry-search" className="block text-sm font-medium text-gray-700">Search partners</label><Input id="registry-search" type="search" maxLength={200} value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="Search company, sector, contact..." /></div>
            {select('approvalStatus', 'Approval', approvalLabels)}
            {select('region', 'Region', Object.fromEntries(GHANA_REGIONS.map(region => [region, region])))}
            {select('sort', 'Sort partners', Object.fromEntries(Object.entries(sortLabels).filter(([key]) => key !== 'newest')))}
          </div>
          <details className="rounded-xl border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline focus-visible:outline-2">More filters: sector, type, operational status, and attention</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {select('sector', 'Sector', Object.fromEntries([...new Set([...sectors, ...(searchParams.get('sector') ? [searchParams.get('sector')!] : [])])].map(sector => [sector, sector])))}
              {select('partnerType', 'Partner type', partnerTypeLabels)}
              {select('partnerStatus', 'Operational status', { Active: 'Active', Inactive: 'Inactive' })}
              {select('attention', 'Needs attention', attentionLabels)}
            </div>
          </details>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Applied registry filters">{FILTER_KEYS.filter(key => key !== 'sort' && searchParams.get(key)).map(key => { const value = searchParams.get(key)!; return <button type="button" key={key} aria-label={`Remove ${registryFilterLabels[key]} filter`} onClick={() => { if (key === 'q') setQueryInput(''); updateFilters({ [key]: '' }) }} className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2"><span className="break-words">{registryFilterLabels[key]}: {approvalLabels[value] || attentionLabels[value] || partnerTypeLabels[value] || value}</span><X aria-hidden="true" className="h-3 w-3 shrink-0" /></button> })}{FILTER_KEYS.some(key => searchParams.has(key)) && <Button variant="ghost" onClick={() => inspect({})}>Clear all filters</Button>}</div>
          <p className="text-xs text-gray-500">All partners in your authorized scope, independent of the current search and filters:</p>
          {loaded && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['All partners', summary.total, ''], ['Pending HQ', summary.pending, 'PendingHQApproval'], ['Approved', summary.approved, 'Approved'], ['Rejected', summary.rejected, 'Rejected']].map(([label, count, value]) => <button key={String(label)} type="button" className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-left focus-visible:outline focus-visible:outline-2" aria-pressed={value ? statusFilter === value : !FILTER_KEYS.some(key => key !== 'sort' && searchParams.get(key))} onClick={() => inspect(value ? { approvalStatus: String(value) } : {})}><span className="text-xs text-gray-500">{label}</span><strong className="mt-1 block text-lg font-semibold tabular-nums text-gray-900">{count}</strong></button>)}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-gray-500">{loading ? loaded ? 'Updating partners… Previous results remain visible.' : 'Loading partner registry…' : error ? 'Results could not be updated.' : `${totalPartners} matching partners`}</p><div className="flex flex-wrap gap-2">{(['csv', 'pdf'] as const).map(format => <Button key={format} variant="outline" disabled={loading || Boolean(error) || exporting !== null || totalPartners === 0 || queryInput.trim() !== query} onClick={() => void exportPartners(format)}>{exporting === format ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download aria-hidden="true" className="mr-2 h-4 w-4" />}{exporting === format ? `Exporting ${format.toUpperCase()}…` : `Export ${format.toUpperCase()}`}</Button>)}</div></div>
          <p className="text-xs text-gray-500">Exports include all matching partners across every page, using the applied filters and sort order. Reported slots do not establish availability for specific dates.</p>
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="outline" onClick={refreshPartners}>Retry registry</Button></div>}
          {loading && !loaded ? <div className="space-y-3">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-20 rounded-xl" />)}</div> : partners.length ? <HQPartnerRegistryList partners={partners} disabled={loading || Boolean(error)} canManage={user?.role === 'SuperAdmin'} canApprove={canApproveHQ(user?.role)} pending={pendingAccounts} onDetails={openDetails} onAllocation={setAllocationPartner} onEdit={openEdit} onDecision={openDecision} onCreateAccount={partner => void createPortalAccount(partner)} onManageAccounts={() => navigate('/users?role=IndustryPartner')} /> : !error && !loading ? <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center"><p className="text-sm text-gray-600">No partners match the current filters.</p><Button variant="outline" className="mt-3" onClick={() => inspect({})}>Clear filters</Button></div> : null}
          {loaded && <div className="flex flex-col justify-between gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center"><p className="text-sm text-gray-500">{loading || error ? 'Last loaded results' : `Showing ${totalPartners ? (page - 1) * PAGE_SIZE + 1 : 0}-${Math.min(page * PAGE_SIZE, totalPartners)} of ${totalPartners} partners`}</p><nav aria-label="Partner pagination" className="flex items-center gap-2"><Button variant="outline" disabled={loading || Boolean(error) || page <= 1} onClick={() => updateFilters({ page: String(page - 1) })}>Previous</Button><span className="min-w-24 text-center text-xs text-gray-600">Page {totalPartners ? page : 0} of {totalPages}</span><Button variant="outline" disabled={loading || Boolean(error) || !totalPartners || page >= totalPages} onClick={() => updateFilters({ page: String(page + 1) })}>Next</Button></nav></div>}
        </section>
      </TabsContent>
      <TabsContent value="insights"><PartnerInsights onInspect={inspect} /></TabsContent>
      <TabsContent value="changes"><PartnerChangeQueue onChange={refreshPartners} /></TabsContent>
      {user?.role === 'SuperAdmin' && <TabsContent value="slot-approvals"><PendingSlotApprovals onChanged={refreshPartners} /></TabsContent>}
    </Tabs>
      <Dialog open={registrationOpen} onOpenChange={setRegistrationOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 sm:max-w-[640px]">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">{editingPartner ? 'Edit Industry Partner' : 'Register Industry Partner'}</DialogTitle>
              <DialogDescription>
                {editingPartner ? 'Update partner details and workplace coordinates for future placements.' : 'HQ registrations are approved immediately and become visible to regional and institution portals in the selected region.'}
              </DialogDescription>
            </DialogHeader>
            <IndustryPartnerForm initialData={editingPartner || undefined} onSuccess={editingPartner ? async () => { setRegistrationOpen(false); setEditingPartner(null); toast.success('Partner updated'); refreshPartners() } : handleRegistrationSuccess} />
          </div>
        </DialogContent>
      </Dialog>
      {allocationPartner && <PartnerSlotAllocations partner={allocationPartner} open={Boolean(allocationPartner)} onOpenChange={value => { if (!value) setAllocationPartner(null) }} onChanged={refreshPartners} />}

      <HQPartnerDetailsDialog
        open={detailsOpen}
        loading={detailsLoading}
        details={partnerDetails}
        selectedName={detailsTarget?.name}
        error={detailsError}
        onRetry={() => setDetailsRevision(value => value + 1)}
        onRestoreFocus={() => { if (detailsTrigger.current?.isConnected) detailsTrigger.current.focus(); else directoryRef.current?.focus() }}
        onOpenChange={open => { setDetailsOpen(open); if (!open) { setPartnerDetails(null); setDetailsTarget(null) } }}
        onEdit={openEdit}
        onDelete={openDelete}
        canManage={user?.role === 'SuperAdmin'}
      />

      <Dialog open={Boolean(deleteDetails)} onOpenChange={(open) => { if (!open && !deleting) { setDeleteDetails(null); setDeleteConfirmation('') } }}>
        <DialogContent className="rounded-2xl border border-gray-200 bg-white sm:max-w-lg">
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

      <Dialog open={Boolean(decisionPartner)} onOpenChange={(open) => !open && !submittingDecision && setDecisionPartner(null)}>
        <DialogContent className="rounded-2xl border border-gray-200 bg-white">
          <DialogHeader>
            <DialogTitle>{decisionType === "approve" ? "Approve Partner" : "Reject Partner"}</DialogTitle>
            <DialogDescription>
              {decisionPartner ? `${decisionType === "approve" ? "Approve" : "Reject"} ${decisionPartner.name}. Approval governs access to the partner network; availability depends on placement dates and reservations.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {decisionPartner && <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-semibold">{decisionPartner.name}</p><p className="mt-1">{decisionPartner.sector} · {decisionPartner.region}</p>
              <p className="mt-1">Submitted by {decisionPartner.addedBy?.name || 'Not recorded'}{decisionPartner.addedBy?.institution ? ` · ${decisionPartner.addedBy.institution}` : ''}</p>
              <p className="mt-1">{locationLabel(decisionPartner)} · {decisionPartner.totalSlots ?? 0} reported slots</p>
              {partnerAttention(decisionPartner).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">{partnerAttention(decisionPartner).map(reason => <li key={reason}>{reason}</li>)}</ul>}
            </div>}
            <label htmlFor="partner-decision-comment" className="text-sm font-medium">{decisionType === 'approve' ? 'Approval note (optional)' : 'Rejection reason (at least 5 characters)'}</label>
            <Textarea
              id="partner-decision-comment"
              maxLength={3000}
              disabled={submittingDecision}
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              placeholder={decisionType === "approve" ? "Optional approval note" : "Reason for rejection"}
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" disabled={submittingDecision} className="rounded-xl" onClick={() => setDecisionPartner(null)}>Cancel</Button>
              <Button
                onClick={submitDecision}
                disabled={submittingDecision || (decisionType === 'reject' && decisionComment.trim().length < 5)}
                className={`rounded-xl ${decisionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"} text-white`}
              >
                {decisionType === "approve" ? <Clock3 className="mr-2 h-4 w-4" /> : <XCircle className="mr-2 h-4 w-4" />}
                {submittingDecision ? decisionType === "approve" ? "Approving…" : "Rejecting…" : decisionType === "approve" ? "Approve Partner" : "Reject Partner"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
}
