
import {
  type ColumnDef,
} from "@tanstack/react-table"

import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
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
import { MoreHorizontal, ClipboardCheck, Eye, Star, User, Calendar, Award, Wrench, MessageSquare, Plus, Download, Search, X, AlertTriangle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useSearchParams } from "react-router-dom"
import { CompetencyAssessmentForm } from "./CompetencyAssessmentForm"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ConfirmationDialog } from "@/components/ConfirmationDialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CompetencyAssessment = {
    _id: string
    assessmentDate: string
    trackingId: string
    assessmentType: 'Practical' | 'Theoretical' | 'Combined' | 'On-the-job'
    technicalSkills: string
    softSkills: string
    professionalism: number
    problemSolving: number
    overallScore: number
    assessorName: string
    recommendations?: string
    learner: {
        _id: string
        name: string
    }
}

export const columns: ColumnDef<CompetencyAssessment>[] = [
  {
      accessorKey: "assessmentDate",
      header: "Date",
      cell: ({ row }) => format(new Date(row.getValue("assessmentDate")), "PP"),
  },
  {
    accessorKey: "trackingId",
    header: "Tracking ID",
  },
  {
    accessorKey: "learner.name",
    header: "Learner Name",
  },
  {
    accessorKey: "assessmentType",
    header: "Type",
    cell: ({ row }) => {
        const type = row.getValue("assessmentType") as string
        return <Badge variant="outline" className="font-bold">{type}</Badge>
    }
  },
  {
    accessorKey: "overallScore",
    header: "Score",
    cell: ({ row }) => {
        const score = row.getValue("overallScore") as number;
        const color = score >= 4 ? 'text-green-600' : score >= 3 ? 'text-amber-600' : 'text-red-600';
        return <div className={`font-black ${color}`}>{score}/5</div>
    }
  },
  {
    accessorKey: "assessorName",
    header: "Assessor",
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const assessment = row.original
      const meta = table.options.meta as {
        onEdit: (assessment: CompetencyAssessment) => void,
        onDelete: (id: string) => void,
        onView: (assessment: CompetencyAssessment) => void,
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
            <DropdownMenuItem onClick={() => meta?.onView(assessment)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(assessment._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(assessment)}>Edit Assessment</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(assessment._id)} className="text-red-600">Delete Record</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

type AssessmentStats = {
    avgScore: number
    byType: { Practical: number; Theoretical: number; Combined: number; 'On-the-job': number }
    scoreHigh: number
    scoreMid: number
    scoreLow: number
}

type AssessmentsResponse = {
    items: CompetencyAssessment[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    stats?: AssessmentStats
}

export default function CompetencyAssessments() {
    const [data, setData] = useState<CompetencyAssessment[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize] = useState(25)
    const [totalAssessments, setTotalAssessments] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [stats, setStats] = useState<AssessmentStats | null>(null)
    const [open, setOpen] = useState(false)
    const [viewOpen, setViewOpen] = useState(false)
    const [editingAssessment, setEditingAssessment] = useState<CompetencyAssessment | null>(null)
    const [viewingAssessment, setViewingAssessment] = useState<CompetencyAssessment | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const { authFetch, user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()
    const isEditingExistingAssessment = Boolean(editingAssessment?._id)

    // Search & filters
    const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const filterType = searchParams.get('assessmentType') || ''

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
        searchTimerRef.current = setTimeout(() => setFilter('search', value.trim()), 400)
    }

    const clearAllFilters = () => { setSearchInput(''); setSearchParams({}, { replace: true }); setPage(1) }
    const hasActiveFilters = !!(searchParams.get('search') || filterType)

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
                if (searchParams.get('search')) params.set('search', searchParams.get('search')!)
                if (filterType) params.set('assessmentType', filterType)
                const res = await authFetch(`/api/assessments?${params.toString()}`)
                if (!res.ok) {
                    const errPayload = await res.json().catch(() => null)
                    throw new Error((errPayload as any)?.message || 'Failed to load assessments')
                }
                const payload = await res.json() as AssessmentsResponse
                setData(Array.isArray(payload?.items) ? payload.items : [])
                setTotalAssessments(typeof payload?.total === 'number' ? payload.total : 0)
                setTotalPages(typeof payload?.totalPages === 'number' ? payload.totalPages : 0)
                if (payload?.stats) setStats(payload.stats)
            } catch (err) {
                console.error(err)
                toast.error(err instanceof Error ? err.message : 'Failed to load assessments')
                setData([])
                setTotalAssessments(0)
                setTotalPages(0)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch, page, pageSize, searchParams, filterType])

    useEffect(() => {
        const learnerId = searchParams.get("learnerId")
        if (!learnerId || open || editingAssessment) return
        setEditingAssessment({
            learner: { _id: learnerId, name: "" },
            assessmentDate: new Date().toISOString(),
            assessmentType: "Practical",
            technicalSkills: "",
            softSkills: "",
            professionalism: 3,
            problemSolving: 3,
            overallScore: 0,
            assessorName: "",
            recommendations: searchParams.get("sourceVisit")
                ? "Initiated from a low-rating monitoring visit. Review visit observations before scoring."
                : "",
        } as CompetencyAssessment)
        setOpen(true)
    }, [editingAssessment, open, searchParams])

    const handleSuccess = () => {
        setOpen(false)
        setEditingAssessment(null)
        if (searchParams.get("learnerId")) {
            const next = new URLSearchParams(searchParams)
            next.delete("learnerId")
            next.delete("sourceVisit")
            setSearchParams(next, { replace: true })
        }
        setRefreshKey(prev => prev + 1)
        toast.success(isEditingExistingAssessment ? "Assessment updated" : "Assessment registered")
    }

    const handleEdit = (assessment: CompetencyAssessment) => { setEditingAssessment(assessment); setOpen(true) }
    const handleView = (assessment: CompetencyAssessment) => { setViewingAssessment(assessment); setViewOpen(true) }
    const handleDelete = (id: string) => { setDeleteTarget(id) }

    const executeDelete = async () => {
        if (!deleteTarget) return
        try {
            const res = await authFetch(`/api/assessments/${deleteTarget}`, { method: 'DELETE' })
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}))
                throw new Error(payload.message || 'Failed to delete assessment')
            }
            if (data.length === 1 && page > 1) { setPage(prev => prev - 1) } else { setRefreshKey(prev => prev + 1) }
            toast.success("Assessment deleted")
        } catch (error) {
            console.error("Error deleting assessment:", error)
            toast.error(error instanceof Error ? error.message : "Failed to delete assessment")
        } finally {
            setDeleteTarget(null)
        }
    }

    const handleExport = async () => {
        try {
            toast.info("Preparing export...")
            const res = await authFetch('/api/assessments/export')
            if (!res.ok) throw new Error("Failed to export")
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `assessments_export_${new Date().toISOString().split('T')[0]}.csv`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            toast.success("Export downloaded successfully")
        } catch (error) {
            console.error("Export error:", error)
            toast.error("Failed to export data")
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl">
                        <ClipboardCheck className="h-8 w-8 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Competency Assessments</h2>
                        <p className="text-muted-foreground">Evaluation of learner technical and soft skills.</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <Button onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    <Button onClick={() => { setEditingAssessment(null); setOpen(true) }} className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 shadow-sm font-bold">
                        <Plus className="mr-2 h-4 w-4" /> New Assessment
                    </Button>
                </div>
            </div>

            {/* Auto-graduation warning */}
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 rounded-2xl border border-amber-200 mx-4 sm:mx-0">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                    <p className="text-sm font-bold text-amber-900">Auto-graduation notice</p>
                    <p className="text-xs text-amber-700 mt-0.5">Creating a new assessment automatically sets the learner's WEL status to "Completed". Ensure the learner is ready for completion before submitting.</p>
                </div>
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
                            <div className="p-1.5 bg-amber-100 rounded-lg"><ClipboardCheck className="h-3.5 w-3.5 text-amber-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Total</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{totalAssessments}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-blue-100 rounded-lg"><Star className="h-3.5 w-3.5 text-blue-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Avg Score</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats.avgScore}<span className="text-sm text-gray-400 font-bold">%</span></p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-emerald-100 rounded-lg"><Award className="h-3.5 w-3.5 text-emerald-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Score Dist.</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold">{stats.scoreHigh} High</Badge>
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] font-bold">{stats.scoreMid} Mid</Badge>
                            <Badge className="bg-red-100 text-red-700 border-0 text-[10px] font-bold">{stats.scoreLow} Low</Badge>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-purple-100 rounded-lg"><Wrench className="h-3.5 w-3.5 text-purple-600" /></div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-400">By Type</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[10px] font-bold">{stats.byType.Practical} Practical</Badge>
                            <Badge variant="outline" className="text-[10px] font-bold">{stats.byType.Theoretical} Theory</Badge>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Search & Filter */}
            <div className="flex flex-col md:flex-row gap-3 px-4 sm:px-0">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search learner name or tracking ID..." value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 pr-9 h-10 rounded-xl bg-white border-gray-200" />
                    {searchInput && (
                        <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    )}
                </div>
                <Select value={filterType} onValueChange={(v) => setFilter('assessmentType', v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-[180px] rounded-xl bg-white border-gray-200 h-10"><SelectValue placeholder="Assessment Type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Practical">Practical</SelectItem>
                        <SelectItem value="Theoretical">Theoretical</SelectItem>
                        <SelectItem value="Combined">Combined</SelectItem>
                        <SelectItem value="On-the-job">On-the-job</SelectItem>
                    </SelectContent>
                </Select>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-gray-500 hover:text-gray-700 font-bold h-10"><X className="mr-1 h-3.5 w-3.5" /> Clear All</Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-none sm:rounded-2xl border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
                {loading ? (
                    <div className="p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <ClipboardCheck className="h-12 w-12 text-gray-200" />
                        <p className="text-sm font-bold text-gray-400">No assessments found</p>
                        {hasActiveFilters ? (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-blue-600 hover:text-blue-700 font-bold">Clear filters →</Button>
                        ) : (
                            <Button variant="ghost" size="sm" onClick={() => { setEditingAssessment(null); setOpen(true) }} className="text-blue-600 hover:text-blue-700 font-bold">Create your first assessment →</Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                    <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-medium text-gray-500">
                            Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalAssessments)} of <span className="font-bold text-gray-900">{totalAssessments}</span> assessments
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-auto">
                            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPage(prev => Math.max(prev - 1, 1))} disabled={page <= 1}>Previous</Button>
                            <span className="min-w-[120px] text-center text-sm font-semibold text-gray-600">Page {page} of {Math.max(totalPages, 1)}</span>
                            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPage(prev => Math.min(prev + 1, Math.max(totalPages, 1)))} disabled={page >= totalPages}>Next</Button>
                        </div>
                    </div>
                    <DataTable
                        exportTitle="Competency Assessments Report"
                        data={data}
                        disablePagination
                        columns={columns}
                        meta={{
                            onEdit: handleEdit,
                            onDelete: handleDelete,
                            onView: handleView,
                            role: user?.role
                        }}
                    />
                    </div>
                )}
            </div>

            {/* View Assessment Details Dialog */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh] rounded-2xl border-0 shadow-2xl p-0">
                    {viewingAssessment && (
                        <div className="p-8">
                            <DialogHeader className="mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/10 rounded-xl">
                                        <ClipboardCheck className="h-6 w-6 text-amber-500" />
                                    </div>
                                    <div>
                                        <DialogTitle className="text-2xl font-black text-gray-900">Assessment Details</DialogTitle>
                                        <DialogDescription className="font-medium text-gray-500">
                                            Tracking ID: {viewingAssessment.trackingId}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-6">
                                {/* Learner Info Card */}
                                <Card className="border-0 shadow-md bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
                                    <CardContent className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-[#FFB800] flex items-center justify-center text-white font-black text-lg">
                                                {viewingAssessment.learner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Learner</p>
                                                <p className="text-lg font-bold text-gray-900">{viewingAssessment.learner.name}</p>
                                            </div>
                                            <Badge variant="outline" className="font-bold border-amber-500 text-amber-600 bg-amber-50">
                                                {viewingAssessment.assessmentType}
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Assessment Details Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="border-0 shadow-sm bg-gray-50 rounded-xl">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                <p className="text-xs font-semibold text-gray-400 uppercase">Assessment Date</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">{format(new Date(viewingAssessment.assessmentDate), "PPP")}</p>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-0 shadow-sm bg-gray-50 rounded-xl">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="h-4 w-4 text-gray-400" />
                                                <p className="text-xs font-semibold text-gray-400 uppercase">Assessor</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">{viewingAssessment.assessorName}</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Separator />

                                {/* Skills Assessment */}
                                <Card className="border-0 shadow-md rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <Wrench className="h-5 w-5 text-[#FFB800]" />
                                            Skills Assessment
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0 space-y-4">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Technical Skills</p>
                                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl">{viewingAssessment.technicalSkills}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Soft Skills</p>
                                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl">{viewingAssessment.softSkills}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Scores */}
                                <Card className="border-0 shadow-md rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <Star className="h-5 w-5 text-[#FFB800]" />
                                            Performance Ratings
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="text-center p-4 bg-gray-50 rounded-xl">
                                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Professionalism</p>
                                                <div className="flex justify-center gap-0.5">
                                                    {[1,2,3,4,5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`h-5 w-5 ${star <= viewingAssessment.professionalism ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-lg font-black text-gray-900 mt-1">{viewingAssessment.professionalism}/5</p>
                                            </div>

                                            <div className="text-center p-4 bg-gray-50 rounded-xl">
                                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Problem Solving</p>
                                                <div className="flex justify-center gap-0.5">
                                                    {[1,2,3,4,5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`h-5 w-5 ${star <= viewingAssessment.problemSolving ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-lg font-black text-gray-900 mt-1">{viewingAssessment.problemSolving}/5</p>
                                            </div>

                                            <div className="text-center p-4 bg-amber-50 rounded-xl border-2 border-amber-200">
                                                <p className="text-xs font-semibold text-amber-600 uppercase mb-2">Overall Score</p>
                                                <div className="flex items-center justify-center gap-1">
                                                    <Award className="h-5 w-5 text-amber-500" />
                                                </div>
                                                <p className="text-2xl font-black text-amber-600">{viewingAssessment.overallScore}%</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Recommendations */}
                                {viewingAssessment.recommendations && (
                                    <Card className="border-0 shadow-md rounded-2xl">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                                <MessageSquare className="h-5 w-5 text-[#FFB800]" />
                                                Recommendations
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <p className="text-sm text-gray-700 bg-amber-50 p-4 rounded-xl border border-amber-100">
                                                {viewingAssessment.recommendations}
                                            </p>
                                        </CardContent>
                                    </Card>
                                )}

                                <div className="flex justify-end pt-4">
                                    <Button
                                        onClick={() => setViewOpen(false)}
                                        className="h-12 px-8 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Form Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] rounded-2xl border-0 shadow-2xl p-0">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                        <DialogTitle className="text-2xl font-black text-gray-900">{isEditingExistingAssessment ? 'Edit Assessment' : 'New Competency Assessment'}</DialogTitle>
                        <DialogDescription className="font-medium text-gray-500">
                            {isEditingExistingAssessment ? 'Update evaluation details.' : 'Register a new skills evaluation.'}
                        </DialogDescription>
                        </DialogHeader>
                        <div className="bg-gray-900 p-8 rounded-2xl shadow-inner">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <CompetencyAssessmentForm onSuccess={handleSuccess} initialData={editingAssessment as any} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmationDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                title="Delete Assessment"
                description="This competency assessment record will be permanently removed. This action cannot be undone."
                confirmLabel="Delete Assessment"
                variant="danger"
                onConfirm={executeDelete}
            />
        </div>
    )
}
