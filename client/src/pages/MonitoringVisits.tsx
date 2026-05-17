
import {
  type ColumnDef,
} from "@tanstack/react-table"

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Download, ShieldCheck, ShieldAlert, ShieldQuestion, AlertTriangle, Handshake, ClipboardCheck, Plus, Search, X, Star, Clock } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { MonitoringVisitForm } from "./MonitoringVisitForm"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { DocumentUpload } from "@/components/DocumentUpload"
import { DocumentList } from "@/components/DocumentList"
import { clearOfflineConflictBridge, getOfflineConflictBridge } from "@/lib/offlineConflictBridge"
import { ConfirmationDialog } from "@/components/ConfirmationDialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

export type MonitoringVisit = {
    _id: string
    visitDate: string
    visitType: string
    attendanceStatus: string
    performanceRating: number
    keyObservations: string
    issuesIdentified: string
    actionRequired: string
    locationVerified?: string
    gpsReviewStatus?: string
    gpsExceptionReason?: string
    gpsReviewComment?: string
    gpsReviewedAt?: string
    distanceFromSite?: number
    learner: {
        _id: string
        name: string
        trackingId: string
        placement?: {
            _id?: string
            location: string
            companyName: string
        }
    }
    // Delegation fields
    isDelegatedVisit?: boolean
    delegatedFromInstitution?: string
}

type VisitStats = {
    avgRating: number
    byType: { Routine: number; Urgent: number; Emergency: number; 'Follow-up': number }
    gpsVerified: number
    gpsUnverified: number
    pendingReview: number
}

type MonitoringVisitsResponse = {
    items: MonitoringVisit[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    stats?: VisitStats
}

type DueVisit = {
    placementId: string
    learner: {
        _id: string
        name: string
        trackingId: string
        program?: string
        year?: string
    } | null
    companyName: string
    location?: string
    cadenceDays: number
    lastVisitAt: string | null
    lastVisitType: string | null
    dueAt: string
    overdueDays: number
}

// eslint-disable-next-line react-refresh/only-export-components
export const columns: ColumnDef<MonitoringVisit>[] = [
  {
      accessorKey: "visitDate",
      header: "Visit Date",
      cell: ({ row }) => format(new Date(row.getValue("visitDate")), "PP"),
  },
  {
    accessorKey: "learner.trackingId",
    header: "Tracking ID",
  },
  {
    id: "name",
    accessorKey: "learner.name",
    header: "Learner Name",
  },
  {
    accessorKey: "learner.placement.companyName",
    header: "Company Name",
    cell: ({ row }) => row.original.learner.placement?.companyName || "N/A"
  },
  {
    accessorKey: "visitType",
    header: "Visit Type",
  },
  {
    accessorKey: "attendanceStatus",
    header: "Attendance",
    cell: ({ row }) => {
        const status = row.getValue("attendanceStatus") as string
        const color = status === 'Present' ? 'bg-green-500' : 'bg-red-500';
        return <Badge className={`${color} text-white`}>{status}</Badge>
    }
  },
  {
    accessorKey: "performanceRating",
    header: "Rating",
    cell: ({ row }) => {
        const rating = row.getValue("performanceRating") as number;
        return <div className="font-bold">{rating}/5</div>
    }
  },
  {
      accessorKey: "keyObservations",
      header: "Observations",
      cell: ({ row }) => <span className="truncate block max-w-[200px]">{row.getValue("keyObservations")}</span>
  },
  {
    accessorKey: "locationVerified",
    header: "Verification",
    cell: ({ row }) => {
      const status = row.original.locationVerified || 'No GPS';
      const dist = row.original.distanceFromSite;
      if (status === 'Verified') return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 rounded-lg font-bold gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
      );
      if (status === 'Unverified') return (
        <div className="space-y-0.5">
          <Badge className="bg-red-100 text-red-700 border-0 rounded-lg font-bold gap-1"><ShieldAlert className="h-3 w-3" /> Unverified</Badge>
          {dist && <div className="text-[10px] text-red-500 font-bold">{(dist / 1000).toFixed(1)}km away</div>}
        </div>
      );
      if (status === 'No Placement') return (
        <Badge className="bg-gray-100 text-gray-500 border-0 rounded-lg font-bold gap-1"><ShieldQuestion className="h-3 w-3" /> No Site</Badge>
      );
      return (
        <Badge className="bg-amber-100 text-amber-700 border-0 rounded-lg font-bold gap-1"><ShieldQuestion className="h-3 w-3" /> No GPS</Badge>
      );
    }
  },
  {
    accessorKey: "gpsReviewStatus",
    header: "GPS Review",
    cell: ({ row }) => {
      const status = row.original.gpsReviewStatus || 'PendingReview'
      const tone = status === 'Verified'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'ExceptionApproved'
          ? 'bg-blue-100 text-blue-700'
          : status === 'Rejected'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-amber-100 text-amber-700'
      const label = status === 'PendingReview' ? 'Pending Review' : status === 'ExceptionApproved' ? 'Exception Approved' : status
      return <Badge className={`${tone} border-0 rounded-lg font-bold`}>{label}</Badge>
    }
  },
  {
    id: "delegated",
    header: "Delegation",
    cell: ({ row }) => {
      if (!row.original.isDelegatedVisit) return null
      return (
        <div className="flex items-center gap-1.5">
          <Handshake className="h-3.5 w-3.5 text-amber-600" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-amber-700">Delegated Visit</span>
            {row.original.delegatedFromInstitution && (
              <span className="text-[9px] text-amber-500">From {row.original.delegatedFromInstitution}</span>
            )}
          </div>
        </div>
      )
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const visit = row.original
      const meta = table.options.meta as { 
        onEdit: (visit: MonitoringVisit) => void, 
        onDelete: (id: string) => void,
        onManageGps?: (visit: MonitoringVisit) => void,
        onCreateBlocker?: (visit: MonitoringVisit) => void,
        onStartAssessment?: (visit: MonitoringVisit) => void,
        role?: string 
      }

      const isSuperAdmin = meta?.role === 'SuperAdmin'
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(visit._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onManageGps?.(visit)}>GPS Review / Evidence</DropdownMenuItem>
                {visit.performanceRating <= 2 ? (
                  <>
                    <DropdownMenuItem onClick={() => meta?.onCreateBlocker?.(visit)}>Create Support Blocker</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => meta?.onStartAssessment?.(visit)}>Start Competency Assessment</DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem onClick={() => meta?.onEdit(visit)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(visit._id)} className="text-red-600">Delete Visit</DropdownMenuItem>
              </>
            )}
            {isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onManageGps?.(visit)}>GPS Review / Evidence</DropdownMenuItem>
                {visit.performanceRating <= 2 ? (
                  <>
                    <DropdownMenuItem onClick={() => meta?.onCreateBlocker?.(visit)}>Create Support Blocker</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => meta?.onStartAssessment?.(visit)}>Start Competency Assessment</DropdownMenuItem>
                  </>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export default function MonitoringVisits() {
    const [data, setData] = useState<MonitoringVisit[]>([])
    const [dueVisits, setDueVisits] = useState<DueVisit[]>([])
    const [dueLoading, setDueLoading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize] = useState(25)
    const [totalVisits, setTotalVisits] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [stats, setStats] = useState<VisitStats | null>(null)
    const [open, setOpen] = useState(false)
    const [editingVisit, setEditingVisit] = useState<MonitoringVisit | null>(null)
    const [gpsReviewVisit, setGpsReviewVisit] = useState<MonitoringVisit | null>(null)
    const [gpsReviewComment, setGpsReviewComment] = useState("")
    const [gpsDocuments, setGpsDocuments] = useState<any[]>([])
    const [gpsDocumentsLoading, setGpsDocumentsLoading] = useState(false)
    const [gpsDecisionSubmitting, setGpsDecisionSubmitting] = useState(false)
    const [bulkGpsOpen, setBulkGpsOpen] = useState(false)
    const [bulkGpsComment, setBulkGpsComment] = useState("")
    const [bulkGpsSubmitting, setBulkGpsSubmitting] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const { authFetch, user } = useAuth()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    // Search & filters
    const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const filterVisitType = searchParams.get('visitType') || ''
    const filterAttendance = searchParams.get('attendanceStatus') || ''
    const filterGpsReview = searchParams.get('gpsReviewStatus') || ''
    const viewMode = searchParams.get('view') || 'visits'

    const setFilter = useCallback((key: string, value: string) => {
        const next = new URLSearchParams(searchParams)
        if (value) { next.set(key, value) } else { next.delete(key) }
        next.delete('page')
        setSearchParams(next, { replace: true })
        setPage(1)
    }, [searchParams, setSearchParams])

    const handleSearchChange = (value: string) => {
        setSearchInput(value)
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
        searchTimerRef.current = setTimeout(() => {
            setFilter('search', value.trim())
        }, 400)
    }

    const clearAllFilters = () => {
        setSearchInput('')
        setSearchParams({}, { replace: true })
        setPage(1)
    }

    const hasActiveFilters = !!(searchParams.get('search') || filterVisitType || filterAttendance || filterGpsReview)
    const pendingVisibleVisitIds = data
        .filter((visit) => (visit.gpsReviewStatus || 'PendingReview') === 'PendingReview')
        .map((visit) => visit._id)

    // Anomalies (admin only)
    interface Anomaly {
        type: string
        severity: string
        message: string
        date: string
        visit: { _id: string; learner?: { name: string; trackingId: string } }
    }
    const [anomalies, setAnomalies] = useState<Anomaly[]>([])
    const [showAnomalies, setShowAnomalies] = useState(false)
    const isAdmin = user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin'
    const canReviewGps = isAdmin || user?.role === 'Admin'

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
                if (searchParams.get('search')) params.set('search', searchParams.get('search')!)
                if (filterVisitType) params.set('visitType', filterVisitType)
                if (filterAttendance) params.set('attendanceStatus', filterAttendance)
                if (filterGpsReview) params.set('gpsReviewStatus', filterGpsReview)
                const res = await authFetch(`/api/monitoring-visits?${params.toString()}`)
                const payload = await res.json().catch(() => null) as MonitoringVisitsResponse | null
                if (!res.ok) {
                    throw new Error(
                        (payload as { message?: string } | null)?.message || "Failed to load monitoring visits"
                    )
                }
                setData(Array.isArray(payload?.items) ? payload.items : [])
                setTotalVisits(typeof payload?.total === "number" ? payload.total : 0)
                setTotalPages(typeof payload?.totalPages === "number" ? payload.totalPages : 0)
                if (payload?.stats) setStats(payload.stats)
            } catch (err) {
                console.error(err)
                toast.error(err instanceof Error ? err.message : "Failed to load monitoring visits")
                setData([])
                setTotalVisits(0)
                setTotalPages(0)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch, isAdmin, page, pageSize, searchParams, filterVisitType, filterAttendance, filterGpsReview])

    useEffect(() => {
        if (viewMode !== 'due') return
        setDueLoading(true)
        authFetch('/api/monitoring-visits/due')
            .then(async (res) => {
                const payload = await res.json().catch(() => null)
                if (!res.ok) throw new Error(payload?.message || 'Failed to load due visits')
                setDueVisits(Array.isArray(payload?.items) ? payload.items : [])
            })
            .catch((error) => {
                console.error(error)
                toast.error(error instanceof Error ? error.message : 'Failed to load due visits')
                setDueVisits([])
            })
            .finally(() => setDueLoading(false))
    }, [authFetch, refreshKey, viewMode])

    // Fetch anomalies separately for admins
    useEffect(() => {
        if (!isAdmin) return
        authFetch('/api/monitoring-visits/anomalies')
            .then(async res => {
                if (!res.ok) throw new Error('Failed to fetch anomalies')
                return res.json()
            })
            .then(data => Array.isArray(data) ? setAnomalies(data) : setAnomalies([]))
            .catch(() => setAnomalies([]))
    }, [authFetch, isAdmin, refreshKey])

    useEffect(() => {
        if (searchParams.get("offlineReview") !== "1") return
        const bridge = getOfflineConflictBridge()
        if (!bridge || bridge.type !== "monitoring-visit") return
        setEditingVisit(bridge.payload as unknown as MonitoringVisit)
        setOpen(true)
    }, [searchParams])

    const handleSuccess = (result?: { offlineQueued?: boolean }) => {
        setOpen(false)
        setEditingVisit(null)
        clearOfflineConflictBridge()
        if (searchParams.get("offlineReview")) {
            const next = new URLSearchParams(searchParams)
            next.delete("offlineReview")
            setSearchParams(next, { replace: true })
        }
        if (result?.offlineQueued) {
            toast.success("Monitoring visit saved offline. It will sync automatically.")
            return
        }
        setPage(1)
        setRefreshKey(prev => prev + 1)
        toast.success("Monitoring visit saved")
    }

    const handleEdit = (visit: MonitoringVisit) => {
        setEditingVisit(visit)
        setOpen(true)
    }

    const loadGpsDocuments = async (visitId: string) => {
        setGpsDocumentsLoading(true)
        try {
            const res = await authFetch(`/api/documents?monitoringVisitId=${visitId}`)
            const payload = await res.json()
            setGpsDocuments(Array.isArray(payload) ? payload : [])
        } catch {
            setGpsDocuments([])
        } finally {
            setGpsDocumentsLoading(false)
        }
    }

    const handleManageGps = (visit: MonitoringVisit) => {
        setGpsReviewVisit(visit)
        setGpsReviewComment(visit.gpsReviewComment || "")
        loadGpsDocuments(visit._id)
    }

    const handleGpsDecision = async (decision: "approve_exception" | "reject" | "mark_verified") => {
        if (!gpsReviewVisit) return
        setGpsDecisionSubmitting(true)
        try {
            const res = await authFetch(`/api/monitoring-visits/${gpsReviewVisit._id}/gps-review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, comment: gpsReviewComment }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || 'Failed to update GPS review')
            toast.success("GPS review updated")
            setGpsReviewVisit(null)
            setRefreshKey(prev => prev + 1)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update GPS review")
        } finally {
            setGpsDecisionSubmitting(false)
        }
    }

    const handleBulkGpsDecision = async (decision: "approve_exception" | "reject" | "mark_verified") => {
        if (!pendingVisibleVisitIds.length) return
        if (decision === "reject" && !bulkGpsComment.trim()) {
            toast.error("A review comment is required when rejecting GPS verification.")
            return
        }
        setBulkGpsSubmitting(true)
        try {
            const res = await authFetch('/api/monitoring-visits/gps-review/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitIds: pendingVisibleVisitIds, decision, comment: bulkGpsComment }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || 'Failed to bulk update GPS review')
            toast.success(`Updated ${payload.updated?.length || 0} visit(s)${payload.skipped?.length ? `; ${payload.skipped.length} skipped` : ''}`)
            setBulkGpsOpen(false)
            setBulkGpsComment("")
            setRefreshKey(prev => prev + 1)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to bulk update GPS review")
        } finally {
            setBulkGpsSubmitting(false)
        }
    }

    const createVisitSupportBlocker = async (visit: MonitoringVisit) => {
        try {
            const res = await authFetch('/api/support-tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: `Low monitoring rating for ${visit.learner?.name || 'learner'}`,
                    category: 'Workflow',
                    priority: visit.performanceRating <= 1 ? 'Urgent' : 'High',
                    description: [
                        `Monitoring visit on ${format(new Date(visit.visitDate), "PP")} recorded a ${visit.performanceRating}/5 performance rating.`,
                        visit.issuesIdentified ? `Issues: ${visit.issuesIdentified}` : '',
                        visit.actionRequired ? `Action required: ${visit.actionRequired}` : '',
                    ].filter(Boolean).join('\n\n'),
                    learnerId: visit.learner?._id,
                    placementId: visit.learner?.placement?._id,
                }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || 'Failed to create support blocker')
            toast.success('Support blocker created')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create support blocker')
        }
    }

    const startAssessmentFromVisit = (visit: MonitoringVisit) => {
        if (!visit.learner?._id) {
            toast.error("This visit is missing a learner link.")
            return
        }
        navigate(`/assessments?learnerId=${visit.learner._id}&sourceVisit=${visit._id}`)
    }

    const handleDelete = (id: string) => {
        setDeleteTarget(id)
    }

    const executeDelete = async () => {
        if (!deleteTarget) return
        try {
            const res = await authFetch(`/api/monitoring-visits/${deleteTarget}`, { method: 'DELETE' })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to delete visit")
            if (data.length === 1 && page > 1) {
                setPage((prev) => prev - 1)
            } else {
                setRefreshKey(prev => prev + 1)
            }
            toast.success("Visit deleted")
        } catch (error) {
            console.error("Error deleting visit:", error)
            toast.error(error instanceof Error ? error.message : "Failed to delete visit")
        } finally {
            setDeleteTarget(null)
        }
    }

    const handleExport = async () => {
        try {
            toast.info("Preparing export...");
            const res = await authFetch('/api/monitoring-visits/export');
            if (!res.ok) throw new Error("Failed to export");
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `visits_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Export downloaded successfully");
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export data");
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-xl"><ClipboardCheck className="h-5 w-5 text-blue-600" /></div>
                    Monitoring Visits
                </h2>
                <p className="text-muted-foreground">
                    Track and review monitoring visits and learner performance.
                </p>
                </div>
                <div className="flex items-center space-x-3">
                    <Button data-help-id="monitoring-visits-export" onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    <Button onClick={() => { setEditingVisit(null); setOpen(true) }} className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 shadow-sm font-bold">
                        <Plus className="mr-2 h-4 w-4" /> Log Visit
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 px-4 sm:px-0">
                <Button
                    variant={viewMode === 'visits' ? 'default' : 'outline'}
                    onClick={() => setFilter('view', '')}
                    className={`rounded-xl font-bold ${viewMode === 'visits' ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                    Visit Log
                </Button>
                <Button
                    variant={viewMode === 'due' ? 'default' : 'outline'}
                    onClick={() => setFilter('view', 'due')}
                    className={`rounded-xl font-bold ${viewMode === 'due' ? 'bg-amber-500 text-gray-900 hover:bg-amber-600' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                    <Clock className="mr-2 h-4 w-4" />
                    Due Visits
                    {dueVisits.length > 0 ? <Badge className="ml-2 bg-white text-amber-700 border-0">{dueVisits.length}</Badge> : null}
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        const next = new URLSearchParams(searchParams)
                        next.delete('view')
                        next.set('gpsReviewStatus', 'PendingReview')
                        next.delete('page')
                        setSearchParams(next, { replace: true })
                        setPage(1)
                    }}
                    className="rounded-xl border-amber-200 bg-amber-50 font-bold text-amber-700 hover:bg-amber-100"
                >
                    <ShieldQuestion className="mr-2 h-4 w-4" />
                    Pending GPS Review
                </Button>
            </div>

            {/* Stat Cards */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 sm:px-0">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                </div>
            ) : stats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 sm:px-0">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-blue-100 rounded-lg"><ClipboardCheck className="h-3.5 w-3.5 text-blue-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Total Visits</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{totalVisits}</p>
                        <p className="text-xs text-gray-500 mt-1">{stats.byType.Routine} routine · {stats.byType.Urgent + stats.byType.Emergency} urgent/emergency</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-amber-100 rounded-lg"><Star className="h-3.5 w-3.5 text-amber-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Avg Rating</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats.avgRating}<span className="text-sm text-gray-400 font-bold">/5</span></p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-emerald-100 rounded-lg"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">GPS Verified</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats.gpsVerified}</p>
                        <p className="text-xs text-gray-500 mt-1">{stats.gpsUnverified} unverified · {stats.pendingReview} pending</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-purple-100 rounded-lg"><Handshake className="h-3.5 w-3.5 text-purple-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">By Type</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[10px] font-bold">{stats.byType.Routine} Routine</Badge>
                            <Badge variant="outline" className="text-[10px] font-bold">{stats.byType['Follow-up']} Follow-up</Badge>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Search & Filters */}
            <div className="flex flex-col md:flex-row gap-3 px-4 sm:px-0">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search learner name or tracking ID..." value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 pr-9 h-10 rounded-xl bg-white border-gray-200" />
                    {searchInput && (
                        <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    )}
                </div>
                <Select value={filterVisitType} onValueChange={(v) => setFilter('visitType', v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-[160px] rounded-xl bg-white border-gray-200 h-10"><SelectValue placeholder="Visit Type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Routine">Routine</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterAttendance} onValueChange={(v) => setFilter('attendanceStatus', v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-[160px] rounded-xl bg-white border-gray-200 h-10"><SelectValue placeholder="Attendance" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Attendance</SelectItem>
                        <SelectItem value="Present">Present</SelectItem>
                        <SelectItem value="Absent">Absent</SelectItem>
                        <SelectItem value="Excused">Excused</SelectItem>
                        <SelectItem value="Late">Late</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterGpsReview} onValueChange={(v) => setFilter('gpsReviewStatus', v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-[180px] rounded-xl bg-white border-gray-200 h-10"><SelectValue placeholder="GPS Review" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All GPS Status</SelectItem>
                        <SelectItem value="PendingReview">Pending Review</SelectItem>
                        <SelectItem value="Verified">Verified</SelectItem>
                        <SelectItem value="ExceptionApproved">Exception Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                </Select>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-gray-500 hover:text-gray-700 font-bold h-10"><X className="mr-1 h-3.5 w-3.5" /> Clear All</Button>
                )}
            </div>

            {viewMode === 'due' ? (
                <div className="rounded-none sm:rounded-2xl border-y sm:border border-amber-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-4 sm:p-6">
                    {dueLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                        </div>
                    ) : dueVisits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <ShieldCheck className="h-12 w-12 text-emerald-200" />
                            <p className="text-sm font-bold text-gray-500">No overdue monitoring visits</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Overdue Monitoring Cadence</h3>
                                    <p className="text-sm font-medium text-gray-500">Active placements whose next visit is past the configured cadence.</p>
                                </div>
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200">{dueVisits.length} due</Badge>
                            </div>
                            {dueVisits.map((item) => (
                                <div key={item.placementId} className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 md:flex-row md:items-center md:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-black text-gray-900">{item.learner?.name || 'Learner'}</p>
                                            <Badge variant="outline" className="bg-white font-bold">{item.learner?.trackingId || 'No tracking ID'}</Badge>
                                            <Badge className="bg-rose-100 text-rose-700 border-rose-200">{item.overdueDays} day{item.overdueDays === 1 ? '' : 's'} overdue</Badge>
                                        </div>
                                        <p className="mt-1 text-sm font-medium text-gray-600">{item.companyName || 'No company'}{item.location ? ` · ${item.location}` : ''}</p>
                                        <p className="mt-1 text-xs font-bold text-amber-700">
                                            Due {item.dueAt ? format(new Date(item.dueAt), 'PP') : 'N/A'} · Cadence every {item.cadenceDays} days
                                            {item.lastVisitAt ? ` · Last ${item.lastVisitType || 'visit'} ${format(new Date(item.lastVisitAt), 'PP')}` : ' · No visit logged yet'}
                                        </p>
                                    </div>
                                    <Button onClick={() => { setEditingVisit(null); setOpen(true) }} className="rounded-xl bg-[#FFB800] font-bold text-gray-900 hover:bg-[#e5a600]">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Log Visit
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
            <div data-help-id="monitoring-visits-table" className="rounded-none sm:rounded-2xl border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
                {loading ? (
                    <div className="p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <ClipboardCheck className="h-12 w-12 text-gray-200" />
                        <p className="text-sm font-bold text-gray-400">No monitoring visits found</p>
                        {hasActiveFilters ? (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-blue-600 hover:text-blue-700 font-bold">Clear filters →</Button>
                        ) : (
                            <Button variant="ghost" size="sm" onClick={() => { setEditingVisit(null); setOpen(true) }} className="text-blue-600 hover:text-blue-700 font-bold">Log your first visit →</Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                    {canReviewGps && pendingVisibleVisitIds.length > 0 ? (
                        <div className="mx-4 mt-4 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="font-black text-amber-900">Pending GPS review on this page</p>
                                <p className="text-sm font-medium text-amber-700">{pendingVisibleVisitIds.length} visible visit{pendingVisibleVisitIds.length === 1 ? '' : 's'} can be reviewed in bulk.</p>
                            </div>
                            <Button onClick={() => setBulkGpsOpen(true)} className="rounded-xl bg-amber-500 font-bold text-gray-900 hover:bg-amber-600">
                                Bulk Review Visible
                            </Button>
                        </div>
                    ) : null}
                    <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-medium text-gray-500">
                            Showing {data.length === 0 ? 0 : ((page - 1) * pageSize) + 1}
                            {" "}-{" "}
                            {Math.min(page * pageSize, totalVisits)}
                            {" "}of{" "}
                            <span className="font-bold text-gray-900">{totalVisits}</span> visits
                        </div>
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
                    <DataTable 
                        exportTitle="Monitoring Visits Export"
                        data={data} 
                        disablePagination
                        columns={columns} 
                        meta={{ 
                            onEdit: handleEdit, 
                            onDelete: handleDelete,
                            onManageGps: handleManageGps,
                            onCreateBlocker: createVisitSupportBlocker,
                            onStartAssessment: startAssessmentFromVisit,
                            role: user?.role 
                        }} 
                    />
                    </div>
                )}
            </div>
            )}

            {/* Anomalies Section (Admin Only) */}
            {isAdmin && anomalies.length > 0 && (
                <div className="mt-6 rounded-none sm:rounded-2xl border-y sm:border border-red-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-4 sm:p-6">
                    <button
                        onClick={() => setShowAnomalies(!showAnomalies)}
                        className="flex items-center justify-between w-full"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-lg font-black text-gray-900">Anomalies Detected</h3>
                                <p className="text-xs font-bold text-gray-400">{anomalies.length} suspicious pattern{anomalies.length !== 1 ? 's' : ''} found in the last 30 days</p>
                            </div>
                        </div>
                        <Badge className="bg-red-100 text-red-700 border-0 font-bold text-sm rounded-xl px-3">{anomalies.length}</Badge>
                    </button>
                    {showAnomalies && (
                        <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
                            {anomalies.map((a, i) => (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                                    a.severity === 'high' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                                }`}>
                                    <div className={`mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                                        a.severity === 'high' ? 'bg-red-200 text-red-700' : 'bg-amber-200 text-amber-700'
                                    }`}>
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={`text-[10px] font-black uppercase border-0 rounded-md ${
                                                a.type === 'location_mismatch' ? 'bg-red-200 text-red-800' :
                                                a.type === 'bulk_submission' ? 'bg-purple-200 text-purple-800' :
                                                a.type === 'off_hours' ? 'bg-amber-200 text-amber-800' :
                                                'bg-gray-200 text-gray-800'
                                            }`}>
                                                {a.type.replace('_', ' ')}
                                            </Badge>
                                            <span className="text-[10px] text-gray-400 font-bold">
                                                {a.visit?.learner?.name && `${a.visit.learner.name} · `}
                                                {new Date(a.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 mt-1">{a.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Dialogs */}
            <Dialog open={open} onOpenChange={(next) => {
                setOpen(next)
                if (!next && searchParams.get("offlineReview")) {
                    clearOfflineConflictBridge()
                    const nextParams = new URLSearchParams(searchParams)
                    nextParams.delete("offlineReview")
                    setSearchParams(nextParams, { replace: true })
                }
            }}>
                <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] rounded-2xl border-0 shadow-2xl p-0">
                    <div className="p-8">
                    <DialogHeader className="mb-6">
                    <DialogTitle className="text-2xl font-black text-gray-900">{editingVisit ? 'Edit Visit' : 'Log Visit'}</DialogTitle>
                    <DialogDescription className="font-medium text-gray-500">
                        {editingVisit ? 'Update the visit details.' : 'Log a new monitoring visit.'}
                    </DialogDescription>
                    </DialogHeader>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <MonitoringVisitForm onSuccess={handleSuccess} initialData={editingVisit as any} />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(gpsReviewVisit)} onOpenChange={(next) => { if (!next) setGpsReviewVisit(null) }}>
                <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">GPS Review and Evidence</DialogTitle>
                        <DialogDescription className="text-gray-500 font-medium">
                            Review GPS verification status, upload supporting files, and resolve exception cases.
                        </DialogDescription>
                    </DialogHeader>
                    {gpsReviewVisit ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <p className="font-bold text-gray-900">{gpsReviewVisit.learner?.name} · {gpsReviewVisit.learner?.trackingId}</p>
                                <p className="text-sm text-gray-500 mt-1">{gpsReviewVisit.learner?.placement?.companyName || "No placement company"} · {gpsReviewVisit.visitType} visit</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge className="bg-gray-900 text-white border-0">{gpsReviewVisit.locationVerified || 'No GPS'}</Badge>
                                    <Badge className="bg-slate-100 text-slate-700 border-slate-200">{gpsReviewVisit.gpsReviewStatus || 'PendingReview'}</Badge>
                                    {gpsReviewVisit.distanceFromSite ? <Badge className="bg-rose-100 text-rose-700 border-rose-200">{(gpsReviewVisit.distanceFromSite / 1000).toFixed(1)}km from site</Badge> : null}
                                </div>
                                {gpsReviewVisit.gpsExceptionReason ? (
                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                        <span className="font-bold">Exception reason:</span> {gpsReviewVisit.gpsExceptionReason}
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-3">
                                <p className="text-sm font-black text-gray-900">Supporting Evidence</p>
                                <DocumentUpload monitoringVisitId={gpsReviewVisit._id} categories={['Visit Photo', 'Report', 'Other']} defaultCategory="Visit Photo" onUploadSuccess={() => loadGpsDocuments(gpsReviewVisit._id)} />
                                <DocumentList documents={gpsDocuments} onDelete={() => loadGpsDocuments(gpsReviewVisit._id)} loading={gpsDocumentsLoading} />
                            </div>
                            {canReviewGps ? (
                                <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-sm font-black text-gray-900">Review Decision</p>
                                    <Textarea value={gpsReviewComment} onChange={(e) => setGpsReviewComment(e.target.value)} placeholder="Add review notes, rejection reason, or conditions for the GPS exception." className="min-h-[120px] bg-white" />
                                    <div className="flex flex-wrap gap-2">
                                        {gpsReviewVisit.locationVerified === 'Verified' ? (
                                            <Button disabled={gpsDecisionSubmitting} onClick={() => handleGpsDecision('mark_verified')} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">Mark Verified</Button>
                                        ) : null}
                                        <Button disabled={gpsDecisionSubmitting} onClick={() => handleGpsDecision('approve_exception')} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Approve Exception</Button>
                                        <Button disabled={gpsDecisionSubmitting} onClick={() => handleGpsDecision('reject')} variant="outline" className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50">Reject</Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog open={bulkGpsOpen} onOpenChange={setBulkGpsOpen}>
                <DialogContent className="sm:max-w-[560px] rounded-2xl border-0 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Bulk GPS Review</DialogTitle>
                        <DialogDescription className="text-gray-500 font-medium">
                            Review the {pendingVisibleVisitIds.length} pending GPS visit{pendingVisibleVisitIds.length === 1 ? '' : 's'} visible on this page.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            value={bulkGpsComment}
                            onChange={(event) => setBulkGpsComment(event.target.value)}
                            placeholder="Add review notes. Required for rejections."
                            className="min-h-[120px] bg-white"
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button disabled={bulkGpsSubmitting} onClick={() => handleBulkGpsDecision('mark_verified')} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                                Mark Verified
                            </Button>
                            <Button disabled={bulkGpsSubmitting} onClick={() => handleBulkGpsDecision('approve_exception')} className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                                Approve Exceptions
                            </Button>
                            <Button disabled={bulkGpsSubmitting} onClick={() => handleBulkGpsDecision('reject')} variant="outline" className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50">
                                Reject
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmationDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                title="Delete Monitoring Visit"
                description="This monitoring visit record will be permanently removed. This action cannot be undone."
                confirmLabel="Delete Visit"
                variant="danger"
                onConfirm={executeDelete}
            />
        </div>
    )
}
