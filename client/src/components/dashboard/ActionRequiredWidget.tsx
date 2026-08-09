import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Activity, AlertCircle, ChevronRight, Clock, RefreshCw, User } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

type TaskScope = "my" | "institution"

interface ActionAlert {
  id: string
  type: "Needs Placement" | "Needs Visit" | "Needs Assessment" | "Setup Required" | "Attendance Overdue" | "Guardian Consent" | "Consent Review" | "Support Blocker"
  learnerId: string
  learnerName: string
  trackingId: string
  message: string
  actionUrl: string
  actionLabel: string
  workflowStage: string
  priority: "Critical" | "High" | "Medium" | "Low"
  blockedBy?: string
  dueAt?: string | null
  owner: { id: string | null; name: string; role?: string }
}

const taskStyles: Record<string, string> = {
  "Needs Placement": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "Needs Visit": "bg-amber-50 text-amber-700 border-amber-100",
  "Needs Assessment": "bg-pink-50 text-pink-700 border-pink-100",
  "Setup Required": "bg-orange-50 text-orange-700 border-orange-100",
  "Attendance Overdue": "bg-red-50 text-red-700 border-red-100",
  "Guardian Consent": "bg-cyan-50 text-cyan-700 border-cyan-100",
  "Consent Review": "bg-teal-50 text-teal-700 border-teal-100",
  "Support Blocker": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
}

const formatDueDate = (value?: string | null) => {
  if (!value) return "No due date"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No due date" : `Due ${date.toLocaleDateString()}`
}

export function ActionRequiredWidget() {
  const [alerts, setAlerts] = useState<ActionAlert[]>([])
  const [scope, setScope] = useState<TaskScope>("my")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sendingReminders, setSendingReminders] = useState(false)
  const { authFetch } = useAuth()
  const navigate = useNavigate()

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await authFetch(`/api/dashboard/action-alerts?scope=${scope}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || "Failed to load operational tasks")
      setAlerts(Array.isArray(payload) ? payload : payload.alerts || [])
    } catch (fetchError) {
      console.error("Failed to fetch action alerts", fetchError)
      setAlerts([])
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load operational tasks")
    } finally {
      setLoading(false)
    }
  }, [authFetch, scope])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const handleBulkReminders = async () => {
    setSendingReminders(true)
    try {
      const response = await authFetch("/api/dashboard/bulk-reminders", {
        method: "POST",
        body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || "Failed to send reminders")
      toast.success(payload.remindersCreated > 0 ? `Sent ${payload.remindersCreated} reminder notification(s)` : "No new reminders were needed")
    } catch (reminderError) {
      console.error("Failed to send bulk reminders", reminderError)
      toast.error(reminderError instanceof Error ? reminderError.message : "Failed to send reminders")
    } finally {
      setSendingReminders(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto" aria-label="Task scope">
          <button type="button" onClick={() => setScope("my")} className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-black transition sm:flex-none ${scope === "my" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            My Tasks
          </button>
          <button type="button" onClick={() => setScope("institution")} className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-black transition sm:flex-none ${scope === "institution" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            Institution Tasks
          </button>
        </div>
        <Button variant="outline" size="sm" className="min-h-10 rounded-xl" disabled={sendingReminders} onClick={handleBulkReminders}>
          {sendingReminders ? "Sending…" : "Send overdue reminders"}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-3 font-black text-red-900">Operational tasks could not be loaded</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <Button type="button" variant="outline" className="mt-4 rounded-xl border-red-200 bg-white" onClick={() => void fetchAlerts()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <Activity className="mx-auto h-9 w-9 text-emerald-600" />
          <p className="mt-3 font-black text-slate-900">{scope === "my" ? "No tasks assigned to you" : "Institution workflow is up to date"}</p>
          <p className="mt-1 text-sm text-slate-600">{scope === "my" ? "Check Institution Tasks for unassigned or team-owned work." : "No pending operational actions were found."}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <button key={alert.id} type="button" onClick={() => navigate(alert.actionUrl)} className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${taskStyles[alert.type] || "bg-blue-50 text-blue-700 border-blue-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-white/80 text-current">{alert.priority}</Badge>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{alert.workflowStage}</span>
                  </div>
                  <p className="mt-3 truncate text-base font-black text-slate-900">{alert.learnerName}</p>
                  <p className="mt-1 text-xs font-bold opacity-80">{alert.trackingId} · {alert.type}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">{alert.message}</p>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Owner: {alert.owner.name}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDueDate(alert.dueAt)}</span>
              </div>
              {alert.blockedBy ? <p className="mt-2 text-xs font-bold text-slate-700">Blocked by: {alert.blockedBy}</p> : null}
              <p className="mt-3 text-sm font-black underline underline-offset-2">{alert.actionLabel}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
