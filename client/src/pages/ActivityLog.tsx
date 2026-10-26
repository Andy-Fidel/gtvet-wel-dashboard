import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Activity, Download, Eye, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/lib/toast'
import { auditActionLabels, auditParams, auditTimestamp, emptyAuditFilters, type AuditAnomalies, type AuditFilters, type AuditLogEntry } from '@/lib/audit-log'
import { AuditEventDetails } from '@/components/AuditEventDetails'
import { AuditAnomalyPanel } from '@/components/AuditAnomalyPanel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

interface Registry {
  items: AuditLogEntry[]
  total: number
  stats: { total: number; creates: number; updates: number; deletes: number }
  entityOptions: string[]
  actorOptions: Array<{ actorId: string; actorName: string; actorRole: string }>
}
const PAGE_SIZE = 10
const ALL = '__all'
const press = 'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:transition-none focus-visible:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100'
const labels: Record<keyof AuditFilters, string> = {
  search: 'Search', action: 'Action', entityType: 'Entity type', actorId: 'Actor', actorName: 'Actor name',
  entityId: 'Entity ID', institution: 'Institution', outcome: 'Auth outcome', dateFrom: 'From', dateTo: 'To',
}
function ActionBadge({ action }: { action: string }) {
  const tone = action === 'DELETE' ? 'border-red-200 bg-red-50 text-red-700'
    : action === 'CREATE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : action === 'STATUS_CHANGE' ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-gray-200 bg-gray-50 text-gray-700'
  return <Badge className={tone}>{auditActionLabels[action] || action}</Badge>
}

export default function ActivityLog() {
  const { authFetch } = useAuth()
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters)
  const [applied, setApplied] = useState<AuditFilters>(emptyAuditFilters)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [anomalies, setAnomalies] = useState<AuditAnomalies | null>(null)
  const [signalsLoading, setSignalsLoading] = useState(true)
  const [signalsError, setSignalsError] = useState('')
  const [signalsRevision, setSignalsRevision] = useState(0)
  const eventsRef = useRef<HTMLElement>(null)
  const detailTriggerRef = useRef<HTMLButtonElement>(null)
  const paramsString = auditParams(applied).toString()
  const dirty = auditParams(draft).toString() !== paramsString

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        const params = new URLSearchParams(paramsString)
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))
        const response = await authFetch(`/api/audit-logs?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load audit events. Please retry.')
        const payload: Registry = await response.json()
        if (controller.signal.aborted) return
        const lastPage = Math.max(1, Math.ceil(payload.total / PAGE_SIZE))
        if (page > lastPage) { setPage(lastPage); return }
        setRegistry(payload)
      } catch (failure) {
        if (!controller.signal.aborted) {
          console.error('Error fetching audit logs:', failure)
          setError('Unable to load audit events. Please retry. Previous results, if shown, may be out of date.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [authFetch, paramsString, page, revision])

  useEffect(() => {
    const controller = new AbortController()
    setSignalsLoading(true)
    setSignalsError('')
    const load = async () => {
      try {
        const response = await authFetch('/api/audit-logs/anomalies', { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to load audit signals')
        const payload = await response.json()
        if (!controller.signal.aborted) setAnomalies(payload)
      } catch (failure) {
        if (!controller.signal.aborted) {
          console.error('Error fetching audit signals:', failure)
          setSignalsError('Unable to update audit signals. Any signals shown are from the previous load.')
        }
      } finally {
        if (!controller.signal.aborted) setSignalsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [authFetch, signalsRevision])

  const apply = (filters: AuditFilters) => {
    const normalized = { ...filters }
    for (const key of Object.keys(normalized) as Array<keyof AuditFilters>) normalized[key] = normalized[key].trim()
    setDraft(normalized)
    setApplied(normalized)
    setFilterError('')
    setPage(1)
    setRevision(value => value + 1)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setFilterError('Start date must be on or before end date.')
      return
    }
    apply(draft)
  }
  const investigate = (filters: Partial<AuditFilters>) => {
    apply({ ...emptyAuditFilters, ...filters })
    eventsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    eventsRef.current?.focus({ preventScroll: true })
  }
  const total = registry?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const logs = registry?.items ?? []
  const setField = (key: keyof AuditFilters, value: string) => setDraft(current => ({ ...current, [key]: value }))
  const refresh = () => { setRevision(value => value + 1); setSignalsRevision(value => value + 1) }

  const exportLogs = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const response = await authFetch(`/api/audit-logs/export?${paramsString}`)
      if (!response.ok) throw new Error('Failed to export audit log')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `audit_log_export_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Audit export downloaded (up to 1,000 latest matching events).')
    } catch (failure) {
      console.error('Error exporting audit logs:', failure)
      toast.error('Unable to export audit events. Please try again.')
    } finally { setExporting(false) }
  }

  const selectField = (key: 'action' | 'entityType' | 'actorId' | 'outcome', options: Array<{ value: string; label: string }>) => (
    <div className="space-y-2">
      <label htmlFor={`audit-${key}`} className="block text-sm font-medium text-gray-700">{labels[key]}</label>
      <Select value={draft[key] || ALL} onValueChange={value => {
        setDraft(current => ({ ...current, [key]: value === ALL ? '' : value, ...(key === 'actorId' ? { actorName: '' } : {}) }))
      }}>
        <SelectTrigger id={`audit-${key}`} className="h-11 rounded-lg border-gray-200 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All {key === 'action' ? 'actions' : key === 'entityType' ? 'entity types' : key === 'actorId' ? 'actors' : 'outcomes'}</SelectItem>
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
  const textField = (key: 'search' | 'entityId' | 'institution' | 'dateFrom' | 'dateTo', placeholder?: string) => (
    <div className="space-y-2">
      <label htmlFor={`audit-${key}`} className="block text-sm font-medium text-gray-700">{labels[key]}{key.startsWith('date') ? ' (UTC)' : ''}</label>
      <Input id={`audit-${key}`} type={key.startsWith('date') ? 'date' : key === 'search' ? 'search' : 'text'}
        value={draft[key]} onChange={event => setField(key, event.target.value)} placeholder={placeholder}
        maxLength={200} className="h-11 rounded-lg border-gray-200 bg-white"
        aria-invalid={key.startsWith('date') && Boolean(filterError)} aria-describedby={key.startsWith('date') && filterError ? 'audit-date-error' : undefined} />
    </div>
  )

  return <div className="mx-auto w-full max-w-7xl flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
    <AuditEventDetails entry={selectedLog} onClose={() => setSelectedLog(null)} onRestoreFocus={() => {
      if (detailTriggerRef.current?.isConnected) detailTriggerRef.current.focus()
      else eventsRef.current?.focus()
    }} />
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900"><ShieldCheck className="h-6 w-6 text-amber-600" aria-hidden="true" />Audit log</h1>
        <p className="mt-1 text-sm text-gray-500">Investigate who changed what, when, and at which institution.</p>
      </div>
      <div className="space-y-2">
        <div className="flex gap-2 lg:justify-end">
          <Button variant="outline" className={`rounded-lg ${press}`} disabled={loading || signalsLoading} onClick={refresh}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading || signalsLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} />Refresh
          </Button>
          <Button variant="outline" className={`rounded-lg ${press}`} disabled={exporting || loading || Boolean(error) || !registry || total === 0} onClick={() => void exportLogs()}>
            <Download aria-hidden="true" className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
        <p className="text-xs text-gray-500">Export uses applied filters · latest 1,000 events maximum · UTC</p>
      </div>
    </header>

    <section data-help-id="activity-log-filters" aria-label="Audit filters" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {textField('search', 'Summary, actor, entity, or ID')}
          {selectField('action', Object.entries(auditActionLabels).map(([value, label]) => ({ value, label })))}
          {selectField('entityType', (registry?.entityOptions || []).map(value => ({ value, label: value })))}
          {selectField('actorId', (registry?.actorOptions || []).map(actor => ({ value: actor.actorId, label: `${actor.actorName} (${actor.actorRole})` })))}
        </div>
        <details className="rounded-xl border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline focus-visible:outline-2">More filters: institution, entity ID, dates, and outcome</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {textField('institution', 'Exact institution name')}
            {textField('entityId', 'Entity ID or part of an ID')}
            {textField('dateFrom')}
            {textField('dateTo')}
            {selectField('outcome', [{ value: 'FAILED', label: 'Failed' }, { value: 'SUCCESS', label: 'Successful' }])}
          </div>
        </details>
        {filterError && <p id="audit-date-error" role="alert" className="text-sm text-red-700">{filterError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className={`rounded-lg bg-[#FFB800] text-gray-900 hover:bg-[#e5a600] ${press}`}>Apply filters</Button>
          <Button type="button" variant="ghost" className={`rounded-lg ${press}`} onClick={() => apply(emptyAuditFilters)}>Clear all</Button>
          <span className="text-sm text-gray-500" role="status">{dirty ? 'Unapplied changes. Apply filters to update results.' : 'Results use the applied filters below.'}</span>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-200 pt-4" aria-label="Applied filters">
        {Object.entries(applied).filter(([, value]) => Boolean(value)).map(([key, value]) => {
          const name = key as keyof AuditFilters
          const display = name === 'action' ? auditActionLabels[value] || value : name === 'actorId' ? registry?.actorOptions.find(actor => actor.actorId === value)?.actorName || value : value
          return <button key={key} type="button" className="inline-flex max-w-full items-center gap-2 rounded-full border bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2" onClick={() => apply({ ...applied, [key]: '' })} aria-label={`Remove ${labels[name]} filter`}>
            <span className="break-all">{labels[name]}: {display}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        })}
        {!Object.values(applied).some(Boolean) && <span className="text-xs text-gray-500">All events in your authorized scope · all dates</span>}
      </div>
    </section>

    <section ref={eventsRef} tabIndex={-1} data-help-id="activity-log-recent-events" aria-label="Audit events" aria-busy={loading} className="scroll-mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm focus-visible:outline focus-visible:outline-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 sm:px-5">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900"><Activity className="h-4 w-4 text-gray-500" aria-hidden="true" />Events</h2>
        <p role="status" className="text-xs text-gray-500">{loading ? registry ? 'Updating… Previous results remain visible.' : 'Loading events…' : error ? 'Results could not be updated.' : `${total.toLocaleString()} matching events`}</p>
      </div>
      {registry && <dl className="grid grid-cols-2 gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-4 sm:px-5" aria-label={loading || error ? 'Last loaded event totals' : 'Matching event totals'}>
        {([['Events', registry.stats.total], ['Creates', registry.stats.creates], ['Updates / status', registry.stats.updates], ['Deletes', registry.stats.deletes]] as const).map(([label, count]) => <div key={label} className="flex items-center gap-2"><dt className="text-gray-500">{label}</dt><dd className="font-semibold tabular-nums">{count.toLocaleString()}</dd></div>)}
      </dl>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry events</Button></div>}
      {!registry && loading ? <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-14 rounded-lg" />)}</div>
        : registry && !logs.length ? <div className="p-10 text-center"><Activity className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" /><p className="font-medium text-gray-800">No matching events</p><p className="mt-1 text-sm text-gray-500">Try a broader date range or clear the filters.</p><Button variant="outline" className="mt-4" onClick={() => apply(emptyAuditFilters)}>Clear filters</Button></div>
          : logs.length > 0 && <>
            <div className="hidden xl:block"><Table>
              <TableHeader><TableRow><TableHead>When (UTC)</TableHead><TableHead>Actor / institution</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Summary</TableHead><TableHead><span className="sr-only">Details</span></TableHead></TableRow></TableHeader>
              <TableBody>{logs.map(log => <TableRow key={log._id}>
                <TableCell className="whitespace-nowrap text-xs text-gray-600"><time dateTime={log.createdAt}>{auditTimestamp(log.createdAt)}</time></TableCell>
                <TableCell><div className="font-medium text-gray-900">{log.actorName}</div><div className="text-xs text-gray-500">{log.actorRole}</div><div className="mt-1 text-xs text-gray-600">{log.institution || 'Not recorded'}</div></TableCell>
                <TableCell><ActionBadge action={log.action} /></TableCell>
                <TableCell><div className="text-sm font-medium">{log.entityType}</div><div className="max-w-40 break-all font-mono text-xs text-gray-500">{log.entityId}</div></TableCell>
                <TableCell className="max-w-xs"><p className="line-clamp-2 text-sm text-gray-700">{log.summary}</p><p className="mt-1 line-clamp-1 text-xs text-gray-500">{log.changedFields?.length ? `${log.changedFields.length} changed ${log.changedFields.length === 1 ? 'field' : 'fields'}` : 'No field changes captured'}</p></TableCell>
                <TableCell><Button variant="ghost" size="sm" className={`rounded-lg ${press}`} aria-label={`View event: ${log.summary}`} onClick={event => { detailTriggerRef.current = event.currentTarget; setSelectedLog(log) }}><Eye aria-hidden="true" className="h-4 w-4" />View</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
            <div className="divide-y divide-gray-200 xl:hidden">{logs.map(log => <article key={log._id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3"><ActionBadge action={log.action} /><time className="text-xs text-gray-500" dateTime={log.createdAt}>{auditTimestamp(log.createdAt)}</time></div>
              <p className="text-sm font-medium text-gray-900">{log.summary}</p>
              <p className="text-sm text-gray-600">{log.actorName} · {log.actorRole}<span className="block text-xs">{log.institution || 'Institution not recorded'}</span></p>
              <p className="break-all text-xs text-gray-500">{log.entityType} · {log.entityId}</p>
              <Button variant="outline" className={`min-h-11 w-full rounded-lg ${press}`} aria-label={`View event: ${log.summary}`} onClick={event => { detailTriggerRef.current = event.currentTarget; setSelectedLog(log) }}>View event details</Button>
            </article>)}</div>
          </>}
      {registry && <div className="flex flex-col justify-between gap-3 border-t border-gray-200 p-4 text-sm sm:flex-row sm:items-center sm:px-5">
        <p className="text-gray-500">{loading || error ? 'Last loaded results' : `Showing ${total ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} events`}</p>
        <nav aria-label="Event pagination" className="flex items-center gap-2">
          <Button variant="outline" className={`rounded-lg ${press}`} disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span className="min-w-24 text-center text-xs tabular-nums text-gray-600">Page {total ? page : 0} of {total ? totalPages : 0}</span>
          <Button variant="outline" className={`rounded-lg ${press}`} disabled={loading || Boolean(error) || page >= totalPages || total === 0} onClick={() => setPage(value => value + 1)}>Next</Button>
        </nav>
      </div>}
    </section>
    <AuditAnomalyPanel data={anomalies} loading={signalsLoading} error={signalsError} onRetry={() => setSignalsRevision(value => value + 1)} onInvestigate={investigate} />
  </div>
}
