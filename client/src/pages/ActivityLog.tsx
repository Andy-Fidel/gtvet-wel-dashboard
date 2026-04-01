import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Activity, Download, Eye, Filter, ShieldCheck } from "lucide-react"
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

const ALL_ACTIONS = "__all_actions"
const ALL_ENTITIES = "__all_entities"

export default function ActivityLog() {
  const { authFetch } = useAuth()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("")
  const [actorFilter, setActorFilter] = useState("")
  const [entityIdFilter, setEntityIdFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

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
      const res = await authFetch(`/api/audit-logs?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch audit logs")
      const data = await res.json()
      setLogs(data)
    } catch (error) {
      console.error("Error fetching audit logs:", error)
      toast.error("Failed to load activity log")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [actionFilter, entityFilter, actorFilter, dateFrom, dateTo])

  const entityOptions = useMemo(() => {
    return [...new Set(logs.map((log) => log.entityType))].sort()
  }, [logs])

  const actorOptions = useMemo(() => {
    const seen = new Map<string, { actorId: string; actorName: string; actorRole: string }>()
    logs.forEach((log) => {
      if (log.actorId && !seen.has(log.actorId)) {
        seen.set(log.actorId, { actorId: log.actorId, actorName: log.actorName, actorRole: log.actorRole })
      }
    })
    return [...seen.values()].sort((a, b) => a.actorName.localeCompare(b.actorName))
  }, [logs])

  const stats = useMemo(() => ({
    total: logs.length,
    creates: logs.filter((log) => log.action === "CREATE").length,
    updates: logs.filter((log) => log.action === "UPDATE" || log.action === "STATUS_CHANGE").length,
    deletes: logs.filter((log) => log.action === "DELETE").length,
  }), [logs])

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

      <Card className="bg-white border-none shadow-xl rounded-[2rem]">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Search summary, actor, entity, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
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
              onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
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
            <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={fetchLogs}>
              Search Audit Log
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#FFB800]" />
            Recent Events
          </CardTitle>
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
