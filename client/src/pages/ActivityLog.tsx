import { useEffect, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Activity, AlertTriangle, Download, Eye, Filter, ShieldCheck } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "UPLOAD" | "AUTH"

interface AuditLogEntry {
  _id: string
  action: AuditAction
  entityType: string
  entityId: string
  summary: string
  actorName: string
  actorRole: string
  actorId?: string
  institution: string
  route: string
  method: string
  changedFields: string[]
  beforeData?: unknown
  afterData?: unknown
  metadata?: unknown
  createdAt: string
}

interface AuditAnomalies {
  windowDays: number
  deleteSpikes: { institution: string; date: string; count: number; severity: string }[]
  failedAuthActors: { actorName: string; institution: string; count: number }[]
  failedAuthInstitutions: { institution: string; count: number }[]
  massUpdates: { actorName: string; institution: string; count: number; severity: string }[]
  riskyInstitutions: { institution: string; score: number; failedAuths: number; deleteSpikes: number }[]
}

const ALL_ACTIONS = "__all_actions"
const ALL_ENTITIES = "__all_entities"

export default function ActivityLog() {
  const RECENT_EVENTS_PAGE_SIZE = 10
  const { authFetch } = useAuth()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [anomalies, setAnomalies] = useState<AuditAnomalies | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("")
  const [actorFilter, setActorFilter] = useState("")
  const [entityIdFilter, setEntityIdFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [recentEventsPage, setRecentEventsPage] = useState(1)
  const [recentEventsTotal, setRecentEventsTotal] = useState(0)
  const [entityOptions, setEntityOptions] = useState<string[]>([])
  const [actorOptions, setActorOptions] = useState<Array<{ actorId: string; actorName: string; actorRole: string }>>([])
  const [stats, setStats] = useState({
    total: 0,
    creates: 0,
    updates: 0,
    deletes: 0,
  })

  const buildParams = () => {
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    if (actionFilter) params.set("action", actionFilter)
    if (entityFilter) params.set("entityType", entityFilter)
    if (actorFilter) params.set("actorId", actorFilter)
    if (entityIdFilter.trim()) params.set("entityId", entityIdFilter.trim())
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    return params
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = buildParams()
      params.set("page", String(recentEventsPage))
      params.set("pageSize", String(RECENT_EVENTS_PAGE_SIZE))
      const res = await authFetch(`/api/audit-logs?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch audit logs")
      const data = await res.json()
      setLogs(Array.isArray(data.items) ? data.items : [])
      setRecentEventsTotal(typeof data.total === "number" ? data.total : 0)
      setStats(data.stats ?? { total: 0, creates: 0, updates: 0, deletes: 0 })
      setEntityOptions(Array.isArray(data.entityOptions) ? data.entityOptions : [])
      setActorOptions(Array.isArray(data.actorOptions) ? data.actorOptions : [])
    } catch (error) {
      console.error("Error fetching audit logs:", error)
      toast.error("Failed to load activity log")
    } finally {
      setLoading(false)
    }
  }

  const fetchAnomalies = async () => {
    try {
      const res = await authFetch("/api/audit-logs/anomalies")
      if (!res.ok) throw new Error("Failed to fetch audit anomalies")
      const data = await res.json()
      setAnomalies(data)
    } catch (error) {
      console.error("Error fetching audit anomalies:", error)
      toast.error("Failed to load audit anomalies")
    }
  }

  useEffect(() => {
    fetchLogs()
    fetchAnomalies()
  }, [actionFilter, entityFilter, actorFilter, dateFrom, dateTo, recentEventsPage])

  useEffect(() => {
    setRecentEventsPage(1)
  }, [actionFilter, entityFilter, actorFilter, dateFrom, dateTo])

  const handleSearchSubmit = () => {
    if (recentEventsPage !== 1) {
      setRecentEventsPage(1)
      return
    }
    fetchLogs()
  }

  const recentEventsTotalPages = Math.max(1, Math.ceil(recentEventsTotal / RECENT_EVENTS_PAGE_SIZE))
  const safeRecentEventsPage = Math.min(recentEventsPage, recentEventsTotalPages)

  const getActionBadge = (action: AuditAction) => {
    if (action === "DELETE") return <Badge className="bg-red-100 text-red-700 border-red-200">Delete</Badge>
    if (action === "CREATE") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Create</Badge>
    if (action === "UPLOAD") return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Upload</Badge>
    if (action === "AUTH") return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Auth</Badge>
    if (action === "STATUS_CHANGE") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Status</Badge>
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Update</Badge>
  }

  const handleExport = async () => {
    try {
      const params = buildParams()
      const res = await authFetch(`/api/audit-logs/export?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to export audit log")
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `audit_log_export_${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success("Audit log export downloaded")
    } catch (error) {
      console.error("Error exporting audit logs:", error)
      toast.error("Failed to export audit log")
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[860px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          {selectedLog && (
            <>
              <DialogHeader className="pt-6 px-6 pb-0">
                <DialogTitle className="text-gray-900">{selectedLog.summary}</DialogTitle>
                <DialogDescription className="text-gray-500">
                  {selectedLog.actorName} · {selectedLog.actorRole} · {format(new Date(selectedLog.createdAt), "PPpp")}
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 pb-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Entity</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{selectedLog.entityType}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Route</p>
                    <p className="text-sm font-bold text-gray-900 mt-1 break-all">{selectedLog.method} {selectedLog.route}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Changed Fields</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{selectedLog.changedFields?.join(", ") || "None captured"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-[#111827] text-white p-4 overflow-auto">
                    <p className="text-xs font-black text-white/50 uppercase tracking-wider mb-3">Before</p>
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(selectedLog.beforeData ?? {}, null, 2)}</pre>
                  </div>
                  <div className="rounded-2xl bg-[#111827] text-white p-4 overflow-auto">
                    <p className="text-xs font-black text-white/50 uppercase tracking-wider mb-3">After</p>
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(selectedLog.afterData ?? selectedLog.metadata ?? {}, null, 2)}</pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Activity & Audit Log
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">
            Review who changed what and when for compliance and troubleshooting.
          </p>
        </div>
        <Button variant="outline" className="rounded-xl border-gray-200" onClick={fetchLogs}>
          <Filter className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" className="rounded-xl border-gray-200" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28 rounded-[2rem]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Events</p><p className="text-3xl font-black text-gray-900">{stats.total}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Creates</p><p className="text-3xl font-black text-emerald-600">{stats.creates}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Updates</p><p className="text-3xl font-black text-blue-600">{stats.updates}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Deletes</p><p className="text-3xl font-black text-red-600">{stats.deletes}</p></CardContent></Card>
        </div>
      )}

      {anomalies ? (
        <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Audit Anomaly Detection
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                <p className="text-sm font-black text-red-700">Delete Spikes</p>
                <div className="mt-3 space-y-3">
                  {anomalies.deleteSpikes.length === 0 ? <p className="text-sm text-gray-500">No unusual delete spikes in the last {anomalies.windowDays} days.</p> : anomalies.deleteSpikes.map((entry) => (
                    <div key={`${entry.institution}-${entry.date}`} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-bold text-gray-900">{entry.institution}</p>
                        <p className="text-gray-500">{entry.date}</p>
                      </div>
                      <Badge className={entry.severity === "high" ? "bg-red-500 text-white border-0" : "bg-orange-100 text-orange-700 border-orange-200"}>{entry.count} deletes</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-sm font-black text-amber-700">Repeated Failed Auth Attempts</p>
                <div className="mt-3 space-y-3">
                  {anomalies.failedAuthActors.length === 0 ? <p className="text-sm text-gray-500">No repeated failed authentication patterns detected.</p> : anomalies.failedAuthActors.map((entry) => (
                    <div key={`${entry.actorName}-${entry.institution}`} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-bold text-gray-900">{entry.actorName}</p>
                        <p className="text-gray-500">{entry.institution}</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.count} failures</Badge>
                    </div>
                  ))}
                </div>
                {anomalies.failedAuthInstitutions.length > 0 ? (
                  <div className="mt-4 border-t border-amber-200 pt-4 space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider text-amber-700">By Institution</p>
                    {anomalies.failedAuthInstitutions.map((entry) => (
                      <div key={entry.institution} className="flex items-center justify-between gap-3 text-sm">
                        <p className="font-bold text-gray-900">{entry.institution}</p>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.count} failures</Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm font-black text-blue-700">Mass Update Signals</p>
                <div className="mt-3 space-y-3">
                  {anomalies.massUpdates.length === 0 ? <p className="text-sm text-gray-500">No sudden mass updates detected.</p> : anomalies.massUpdates.map((entry) => (
                    <div key={`${entry.actorName}-${entry.institution}`} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-bold text-gray-900">{entry.actorName}</p>
                        <p className="text-gray-500">{entry.institution}</p>
                      </div>
                      <Badge className={entry.severity === "high" ? "bg-red-500 text-white border-0" : "bg-blue-100 text-blue-700 border-blue-200"}>{entry.count} updates</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/70 p-4">
                <p className="text-sm font-black text-fuchsia-700">Top Risky Institutions</p>
                <div className="mt-3 space-y-3">
                  {anomalies.riskyInstitutions.length === 0 ? <p className="text-sm text-gray-500">No elevated institution risk detected in this window.</p> : anomalies.riskyInstitutions.map((entry, index) => (
                    <div key={entry.institution} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-bold text-gray-900">#{index + 1} {entry.institution}</p>
                        <p className="text-gray-500">{entry.failedAuths} failed auths · {entry.deleteSpikes} delete spike days</p>
                      </div>
                      <Badge className="bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200">Risk {entry.score}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-help-id="activity-log-filters" className="bg-white border-none shadow-xl rounded-[2rem]">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Search summary, actor, entity, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              className="rounded-xl bg-gray-50 border-gray-200"
            />
            <Select value={actionFilter || ALL_ACTIONS} onValueChange={(value) => setActionFilter(value === ALL_ACTIONS ? "" : value)}>
              <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="STATUS_CHANGE">Status Change</SelectItem>
                <SelectItem value="UPLOAD">Upload</SelectItem>
                <SelectItem value="AUTH">Auth</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter || ALL_ENTITIES} onValueChange={(value) => setEntityFilter(value === ALL_ENTITIES ? "" : value)}>
              <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ENTITIES}>All entities</SelectItem>
                {entityOptions.map((entity) => (
                  <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actorFilter || ALL_ENTITIES} onValueChange={(value) => setActorFilter(value === ALL_ENTITIES ? "" : value)}>
              <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                <SelectValue placeholder="All actors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ENTITIES}>All actors</SelectItem>
                {actorOptions.map((actor) => (
                  <SelectItem key={actor.actorId} value={actor.actorId}>
                    {actor.actorName} ({actor.actorRole})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Input
              placeholder="Filter by entity ID..."
              value={entityIdFilter}
              onChange={(e) => setEntityIdFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              className="rounded-xl bg-gray-50 border-gray-200"
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl bg-gray-50 border-gray-200"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl bg-gray-50 border-gray-200"
            />
          </div>
          <div className="mt-4">
            <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={handleSearchSubmit}>
              Search Audit Log
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-help-id="activity-log-recent-events" className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#FFB800]" />
              Recent Events
            </CardTitle>
            {logs.length > RECENT_EVENTS_PAGE_SIZE ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={safeRecentEventsPage === 1}
                  onClick={() => setRecentEventsPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs font-bold text-gray-500">
                  {safeRecentEventsPage} / {recentEventsTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={safeRecentEventsPage >= recentEventsTotalPages}
                  onClick={() => setRecentEventsPage((page) => Math.min(recentEventsTotalPages, page + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No audit log entries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Changed Fields</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-sm text-gray-600">{format(new Date(log.createdAt), "PP p")}</TableCell>
                    <TableCell>
                      <div className="font-bold text-gray-900">{log.actorName}</div>
                      <div className="text-xs text-gray-500">{log.actorRole}</div>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      <div className="font-bold text-gray-900">{log.entityType}</div>
                      <div className="text-xs text-gray-500 font-mono">{log.entityId}</div>
                    </TableCell>
                    <TableCell className="max-w-[340px]">
                      <div className="text-sm text-gray-700 line-clamp-2">{log.summary}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500 max-w-[200px] line-clamp-2">
                        {log.changedFields?.length ? log.changedFields.join(", ") : "None"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSelectedLog(log)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
