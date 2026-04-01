import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { toast } from "sonner"
import { ClipboardCheck, Clock3, Plus, CheckCircle2, AlertTriangle, Pencil, Trash2, FileClock } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AttendanceLogForm } from "./AttendanceLogForm"

type AttendanceStatus = "Pending" | "SignedOff" | "Rejected"
type AttendanceEntryType = "Daily" | "Weekly"

interface AttendanceLog {
  _id: string
  entryType: AttendanceEntryType
  periodStart: string
  periodEnd: string
  hoursWorked: number
  tasksCompleted: string
  notes?: string
  status: AttendanceStatus
  supervisorComment?: string
  signedOffAt?: string
  learner: {
    _id: string
    name: string
    trackingId: string
    program?: string
  }
  placement: {
    _id: string
    companyName: string
    supervisorName?: string
    supervisorEmail?: string
  }
  submittedBy?: {
    name: string
    role: string
  }
  signedOffBy?: {
    name: string
    role: string
  }
}

const ALL_STATUS = "__all_status"
const ALL_TYPES = "__all_types"

export default function AttendanceLogs() {
  const { authFetch, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")

  const learnerId = useMemo(() => new URLSearchParams(location.search).get("learnerId") || "", [location.search])
  const isIndustryPartner = user?.role === "IndustryPartner"

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (learnerId) params.set("learnerId", learnerId)
        if (statusFilter) params.set("status", statusFilter)
        if (typeFilter) params.set("entryType", typeFilter)

        const res = await authFetch(`/api/attendance-logs?${params.toString()}`)
        if (!res.ok) throw new Error("Failed to fetch attendance logs")
        const data = await res.json()
        setLogs(data)
      } catch (error) {
        console.error("Error fetching attendance logs:", error)
        toast.error("Failed to load attendance logs")
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [authFetch, learnerId, refreshKey, statusFilter, typeFilter])

  const filteredLogs = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return logs.filter((log) => {
      return (
        log.learner.name.toLowerCase().includes(query) ||
        log.learner.trackingId.toLowerCase().includes(query) ||
        log.placement.companyName.toLowerCase().includes(query)
      )
    })
  }, [logs, searchQuery])

  const stats = useMemo(() => {
    const totalHours = filteredLogs.reduce((sum, log) => sum + log.hoursWorked, 0)
    const signedOffHours = filteredLogs
      .filter((log) => log.status === "SignedOff")
      .reduce((sum, log) => sum + log.hoursWorked, 0)
    const pendingCount = filteredLogs.filter((log) => log.status === "Pending").length
    return {
      totalEntries: filteredLogs.length,
      totalHours,
      signedOffHours,
      pendingCount,
    }
  }, [filteredLogs])

  const activeLearnerName = filteredLogs[0]?.learner.name

  const handleSuccess = () => {
    setOpen(false)
    setEditingLog(null)
    setRefreshKey((prev) => prev + 1)
    toast.success(editingLog ? "Attendance log updated" : "Attendance log saved")
  }

  const handleEdit = (log: AttendanceLog) => {
    setEditingLog(log)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this attendance log?")) return
    try {
      const res = await authFetch(`/api/attendance-logs/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to delete attendance log")
      setRefreshKey((prev) => prev + 1)
      toast.success("Attendance log deleted")
    } catch (error) {
      console.error("Error deleting attendance log:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete attendance log")
    }
  }

  const handlePartnerAction = async (log: AttendanceLog, action: "sign-off" | "reject") => {
    const promptLabel = action === "sign-off"
      ? "Optional supervisor comment before sign-off:"
      : "Reason for returning this hours entry:"
    const supervisorComment = window.prompt(promptLabel) ?? ""
    if (action === "reject" && !supervisorComment.trim()) {
      toast.error("A reason is required when rejecting an attendance entry")
      return
    }

    try {
      const res = await authFetch(`/api/attendance-logs/${log._id}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorComment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update attendance log")
      setRefreshKey((prev) => prev + 1)
      toast.success(action === "sign-off" ? "Hours signed off" : "Hours returned for review")
    } catch (error) {
      console.error("Error updating attendance log:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update attendance log")
    }
  }

  const getStatusBadge = (status: AttendanceStatus) => {
    if (status === "SignedOff") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Signed Off</Badge>
    if (status === "Rejected") return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="pt-6 px-6 pb-0">
            <DialogTitle className="text-gray-900">
              {editingLog ? "Edit Attendance Log" : "New Attendance Log"}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Record daily or weekly placement hours and send them for supervisor review.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <AttendanceLogForm
              onSuccess={handleSuccess}
              initialData={editingLog}
              presetLearnerId={learnerId || undefined}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Attendance & Hours
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">
            {learnerId && activeLearnerName
              ? `Viewing placement hours for ${activeLearnerName}.`
              : "Track daily or weekly hours and manage supervisor sign-off."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {learnerId && (
            <Button variant="outline" className="rounded-xl border-gray-200" onClick={() => navigate("/attendance-logs")}>
              View All Logs
            </Button>
          )}
          {!isIndustryPartner && (
            <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold" onClick={() => { setEditingLog(null); setOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Hours
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[2rem]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <FileClock className="h-6 w-6 text-indigo-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Entries</p>
              <p className="text-3xl font-black text-gray-900">{stats.totalEntries}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Clock3 className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Logged Hours</p>
              <p className="text-3xl font-black text-gray-900">{stats.totalHours}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Signed-Off Hours</p>
              <p className="text-3xl font-black text-gray-900">{stats.signedOffHours}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Pending Sign-Off</p>
              <p className="text-3xl font-black text-gray-900">{stats.pendingCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Search learner, tracking ID, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-50 border-gray-200 rounded-xl"
            />
            <Select value={statusFilter || ALL_STATUS} onValueChange={(value) => setStatusFilter(value === ALL_STATUS ? "" : value)}>
              <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>All statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="SignedOff">Signed Off</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter || ALL_TYPES} onValueChange={(value) => setTypeFilter(value === ALL_TYPES ? "" : value)}>
              <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                <SelectValue placeholder="All entry types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All entry types</SelectItem>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-black text-gray-900">Hours Register</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardCheck className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No attendance logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const canEdit = !isIndustryPartner && log.status !== "SignedOff"
                  const canSignOff = isIndustryPartner && log.status !== "SignedOff"
                  return (
                    <TableRow key={log._id}>
                      <TableCell>
                        <div>
                          <div className="font-bold text-gray-900">{log.learner.name}</div>
                          <div className="text-xs text-gray-500 font-mono">{log.learner.trackingId}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-700">
                          {format(new Date(log.periodStart), "MMM d, yyyy")}
                          {log.entryType === "Weekly" && ` to ${format(new Date(log.periodEnd), "MMM d, yyyy")}`}
                        </div>
                      </TableCell>
                      <TableCell>{log.placement.companyName}</TableCell>
                      <TableCell>
                        <span className="font-black text-gray-900">{log.hoursWorked}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{log.entryType}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <div className="font-medium text-gray-800">{log.placement.supervisorName || "Not set"}</div>
                          {log.supervisorComment && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{log.supervisorComment}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <>
                              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleEdit(log)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(log._id)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                          {canSignOff && (
                            <>
                              <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handlePartnerAction(log, "sign-off")}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Sign Off
                              </Button>
                              <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={() => handlePartnerAction(log, "reject")}>
                                Return
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
