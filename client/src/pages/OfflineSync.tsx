import { useMemo } from "react"
import { formatDistanceToNow } from "date-fns"
import { clearDraft, loadDraft } from "@/lib/offlineDrafts"
import { useAuth } from "@/context/AuthContext"
import { clearOfflineConflictBridge, setOfflineConflictBridge } from "@/lib/offlineConflictBridge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw, Trash2, WifiOff, FileWarning, Send } from "lucide-react"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

type DraftItem = {
  key: string
  label: string
  summary: string
}

const describeQueuedAction = (url: string, method: string) => {
  if (url.startsWith("/api/monitoring-visits")) return `${method} monitoring visit`
  if (url.startsWith("/api/attendance-logs")) return `${method} attendance log`
  if (url.startsWith("/api/support-tickets")) return `${method} support ticket activity`
  if (url.startsWith("/api/learners")) return `${method} learner record`
  return `${method} ${url.replace("/api/", "")}`
}

const getQueueStatusBadge = (status: "pending" | "failed" | "needs-review" | "synced") => {
  if (status === "synced") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Synced</Badge>
  if (status === "failed") return <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>
  if (status === "needs-review") return <Badge className="bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200">Needs Review</Badge>
  return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>
}

const formatDraftLabel = (key: string) => {
  if (key.startsWith("draft:monitoring-visit")) return "Monitoring visit draft"
  if (key.startsWith("draft:attendance-log")) return "Attendance log draft"
  if (key.startsWith("draft:support:new-ticket")) return "New support ticket draft"
  if (key.startsWith("draft:support:reply")) return "Support reply draft"
  return "Offline draft"
}

const formatConflictValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Empty"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return "Complex value"
  }
}

export default function OfflineSync() {
  const navigate = useNavigate()
  const {
    offlineQueue,
    offlineQueueCount,
    offlineSyncHistory,
    isSyncingOfflineQueue,
    syncOfflineQueue,
    removeOfflineQueueItem,
    clearOfflineQueue,
  } = useAuth()

  const drafts = useMemo(() => {
    if (typeof window === "undefined") return []

    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith("draft:"))
      .map((key) => {
        const draft = loadDraft<Record<string, unknown> | string>(key)
        let summary = "Saved locally for later completion."
        if (typeof draft === "string") {
          summary = draft.slice(0, 80) || summary
        } else if (draft && typeof draft === "object") {
          const firstUsefulValue = Object.values(draft).find((value) => typeof value === "string" && value.trim())
          if (typeof firstUsefulValue === "string") {
            summary = firstUsefulValue.slice(0, 80)
          }
        }

        return {
          key,
          label: formatDraftLabel(key),
          summary,
        } satisfies DraftItem
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [offlineQueueCount])

  const handleClearDraft = (key: string) => {
    clearDraft(key)
    toast.success("Offline draft cleared")
    window.location.reload()
  }

  const handleOpenForReview = (item: (typeof offlineQueue)[number]) => {
    try {
      const payload = JSON.parse(item.body) as Record<string, unknown>
      clearOfflineConflictBridge()

      if (item.url.startsWith("/api/monitoring-visits")) {
        setOfflineConflictBridge({ type: "monitoring-visit", payload })
        navigate("/monitoring-visits?offlineReview=1")
        return
      }

      if (item.url.startsWith("/api/attendance-logs")) {
        setOfflineConflictBridge({ type: "attendance-log", payload })
        navigate("/attendance-logs?offlineReview=1")
        return
      }

      if (item.url === "/api/support-tickets") {
        setOfflineConflictBridge({ type: "support-ticket", payload })
        navigate("/support-center?compose=1&offlineReview=1")
        return
      }

      const replyMatch = item.url.match(/^\/api\/support-tickets\/([^/]+)\/replies$/)
      if (replyMatch) {
        setOfflineConflictBridge({ type: "support-reply", payload, ticketId: replyMatch[1] })
        navigate(`/support-center?ticket=${replyMatch[1]}&offlineReply=1`)
        return
      }

      toast.error("This queued action does not have a guided review form yet.")
    } catch {
      toast.error("Could not open the queued payload for review.")
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-6xl mx-auto w-full">
      <div className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_45%,_#eff6ff_100%)] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-amber-800">
              <WifiOff className="h-3.5 w-3.5" />
              Field Resilience
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-gray-900">Offline Sync Center</h2>
            <p className="mt-2 text-sm font-medium text-gray-600">
              Review queued field actions, trigger sync when connectivity returns, and clear stale local drafts intentionally.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void syncOfflineQueue()}
              disabled={isSyncingOfflineQueue || offlineQueueCount === 0}
              className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingOfflineQueue ? "animate-spin" : ""}`} />
              {isSyncingOfflineQueue ? "Syncing..." : "Sync Now"}
            </Button>
            <Button
              variant="outline"
              className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => {
                clearOfflineQueue()
                toast.success("Offline queue cleared")
              }}
              disabled={offlineQueueCount === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Queue
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500">Queued Actions</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{offlineQueueCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500">Saved Drafts</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{drafts.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500">Sync State</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{isSyncingOfflineQueue ? "Syncing" : "Idle"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Send className="h-5 w-5 text-amber-600" />
              Queued Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {offlineQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                No queued actions pending sync.
              </div>
            ) : (
              offlineQueue.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-gray-900">{describeQueuedAction(item.url, item.method)}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.url}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        Queued {formatDistanceToNow(new Date(item.queuedAt), { addSuffix: true })}
                      </p>
                      {item.lastAttemptAt ? (
                        <p className="text-xs text-gray-400 mt-1">
                          Last tried {formatDistanceToNow(new Date(item.lastAttemptAt), { addSuffix: true })}
                        </p>
                      ) : null}
                      {item.lastError ? (
                        <p className="text-xs font-medium text-red-600 mt-2">{item.lastError}</p>
                      ) : null}
                      {item.conflictDetails ? (
                        <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 p-3">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-800">
                            Server Conflict Detected
                          </p>
                          <div className="mt-2 space-y-1 text-xs text-fuchsia-900">
                            <p>
                              <span className="font-semibold">Type:</span> {item.conflictDetails.entityType}
                            </p>
                            {item.conflictDetails.clientUpdatedAt ? (
                              <p>
                                <span className="font-semibold">Queued version:</span>{" "}
                                {new Date(item.conflictDetails.clientUpdatedAt).toLocaleString()}
                              </p>
                            ) : null}
                            {item.conflictDetails.serverUpdatedAt ? (
                              <p>
                                <span className="font-semibold">Server version:</span>{" "}
                                {new Date(item.conflictDetails.serverUpdatedAt).toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                          {item.conflictDetails.changedFields?.length ? (
                            <div className="mt-3 space-y-2">
                              {item.conflictDetails.changedFields.slice(0, 4).map((change) => (
                                <div key={change.field} className="rounded-xl border border-fuchsia-100 bg-white/80 p-3">
                                  <p className="text-xs font-black text-fuchsia-900">{change.field}</p>
                                  <p className="mt-1 text-xs text-gray-700">
                                    <span className="font-semibold text-gray-900">Server:</span>{" "}
                                    {formatConflictValue(change.serverValue)}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-700">
                                    <span className="font-semibold text-gray-900">Queued:</span>{" "}
                                    {formatConflictValue(change.clientValue)}
                                  </p>
                                </div>
                              ))}
                              {item.conflictDetails.changedFields.length > 4 ? (
                                <p className="text-[11px] font-medium text-fuchsia-700">
                                  {item.conflictDetails.changedFields.length - 4} more changed field
                                  {item.conflictDetails.changedFields.length - 4 === 1 ? "" : "s"} in this conflict.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getQueueStatusBadge(item.syncStatus)}
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">{item.method}</Badge>
                      {typeof item.attemptCount === "number" && item.attemptCount > 0 ? (
                        <span className="text-[11px] font-bold text-gray-500">Attempts: {item.attemptCount}</span>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeOfflineQueueItem(item.id)}
                      >
                        Remove
                      </Button>
                      {item.syncStatus === "needs-review" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-amber-200 text-amber-800 hover:bg-amber-50"
                          onClick={() => handleOpenForReview(item)}
                        >
                          Review
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-blue-600" />
              Local Drafts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                No saved offline drafts.
              </div>
            ) : (
              drafts.map((draft) => (
                <div key={draft.key} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-gray-900">{draft.label}</p>
                      <p className="text-sm text-gray-600 mt-1">{draft.summary}</p>
                      <p className="text-xs text-gray-400 mt-2">{draft.key}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleClearDraft(draft.key)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-xl rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
              Recent Sync History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {offlineSyncHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                No sync activity recorded yet.
              </div>
            ) : (
              offlineSyncHistory.slice(0, 10).map((item) => (
                <div key={`${item.id}-${item.status}-${item.syncedAt || item.queuedAt}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-gray-900">{describeQueuedAction(item.url, item.method)}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.url}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {item.syncedAt
                          ? formatDistanceToNow(new Date(item.syncedAt), { addSuffix: true })
                          : formatDistanceToNow(new Date(item.queuedAt), { addSuffix: true })}
                      </p>
                      {item.lastError ? (
                        <p className="text-xs font-medium text-red-600 mt-2">{item.lastError}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getQueueStatusBadge(item.status)}
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">{item.method}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
