import { isHQRole } from '@/lib/rbac'

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
import { MoreHorizontal, ClipboardCheck, Eye, Star, User, Calendar, Award, Wrench, MessageSquare, Plus, Download, Search, X, AlertTriangle, ArrowUpRight } from "lucide-react"
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
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

const ASSESSMENT_TYPE_COLORS = ['#f59e0b', '#4f46e5', '#10b981', '#8b5cf6']
const ASSESSMENT_SCORE_COLORS = ['#10b981', '#f59e0b', '#ef4444']
type OversightSection = 'overview' | 'exceptions' | 'records'

export type CompetencyAssessment = {
    _id: string
    institution?: string
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
        program?: string
    }
}

// eslint-disable-next-line react-refresh/only-export-components
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
    accessorKey: "institution",
    header: "Institution",
    cell: ({ row }) => row.original.institution || "N/A",
  },
  {
    accessorKey: "learner.program",
    header: "Program",
    cell: ({ row }) => row.original.learner.program || "N/A",
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

      const isOversightUser = isHQRole(meta?.role) || meta?.role === 'RegionalAdmin'

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
            {!isOversightUser && (
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
    programRanking: { program: string; count: number; avgScore: number }[]
    institutionRanking: { institution: string; count: number; avgScore: number; lowScoreCount: number }[]
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
    const isHeadquarters = isHQRole(user?.role)
    const isRegionalOversight = user?.role === 'RegionalAdmin'
    const isOversightPortal = isHeadquarters || isRegionalOversight
    const oversightScopeLabel = isHeadquarters ? 'National' : 'Regional'
    const oversightPortalLabel = isHeadquarters ? 'Headquarters' : 'Regional'

    // Search & filters
    const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const filterType = searchParams.get('assessmentType') || ''
    const requestedView = searchParams.get('view')
    const hqSection: OversightSection = requestedView === 'exceptions' || requestedView === 'records' ? requestedView : 'overview'
    const scoreBand = searchParams.get('scoreBand') || ''
    const effectivePageSize = isOversightPortal && hqSection === 'exceptions' ? 10 : pageSize

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

    const clearAllFilters = () => {
        setSearchInput('')
        setSearchParams(isOversightPortal ? { view: hqSection } : {}, { replace: true })
        setPage(1)
    }
    const hasActiveFilters = !!(searchParams.get('search') || filterType || scoreBand)

    const setHeadquartersSection = (section: OversightSection) => {
        const next = new URLSearchParams(searchParams)
        next.set('view', section)
        if (section === 'exceptions') next.set('scoreBand', 'low')
        next.delete('page')
        setSearchParams(next, { replace: true })
        setPage(1)
    }

    const openAllAssessmentExceptions = () => {
        const next = new URLSearchParams(searchParams)
        next.set('view', 'records')
        next.set('scoreBand', 'low')
        next.delete('page')
        setSearchParams(next, { replace: true })
        setPage(1)
    }

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams({ page: String(page), pageSize: String(effectivePageSize) })
                if (searchParams.get('search')) params.set('search', searchParams.get('search')!)
                if (filterType) params.set('assessmentType', filterType)
                if (isOversightPortal && hqSection === 'exceptions') params.set('scoreBand', 'low')
                else if (scoreBand) params.set('scoreBand', scoreBand)
                const res = await authFetch(`/api/assessments?${params.toString()}`)
                if (!res.ok) {
                    const errPayload = await res.json().catch(() => null)
                    throw new Error((errPayload as { message?: string } | null)?.message || 'Failed to load assessments')
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
    }, [refreshKey, authFetch, effectivePageSize, hqSection, isOversightPortal, page, searchParams, filterType, scoreBand])

    useEffect(() => {
        if (isOversightPortal) return
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
    }, [editingAssessment, isOversightPortal, open, searchParams])

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

    const assessmentStatCards = stats ? [
        {
            label: "Total Assessments",
            value: totalAssessments,
            Icon: ClipboardCheck,
            detail: "Assessment records",
        },
        {
            label: "Avg Score",
            value: `${stats.avgScore}%`,
            Icon: Star,
            detail: "Average learner score",
        },
        {
            label: "High Scores",
            value: stats.scoreHigh,
            Icon: Award,
            detail: `${stats.scoreMid} mid · ${stats.scoreLow} low`,
        },
        {
            label: "Practical",
            value: stats.byType.Practical,
            Icon: Wrench,
            detail: `${stats.byType.Theoretical} theoretical assessments`,
        },
    ] : []

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl">
                        <ClipboardCheck className="h-8 w-8 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Competency Assessments</h2>
                        <p className="text-muted-foreground">
                            {isOversightPortal
                                ? `${oversightScopeLabel} competency outcomes, assessment mix, and learner-performance oversight.`
                                : 'Evaluation of learner technical and soft skills.'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    {isOversightPortal ? (
                        <Badge className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">{oversightPortalLabel} · Read only</Badge>
                    ) : null}
                    <Button onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    {!isOversightPortal ? (
                        <Button onClick={() => { setEditingAssessment(null); setOpen(true) }} className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 shadow-sm font-bold">
                            <Plus className="mr-2 h-4 w-4" /> New Assessment
                        </Button>
                    ) : null}
                </div>
            </div>

            {isOversightPortal ? (
                <nav className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm sm:grid-cols-3" aria-label={`${oversightPortalLabel} assessment views`}>
                    {([
                        { value: 'overview', label: 'Overview', description: `${oversightScopeLabel} outcomes and assessment mix` },
                        { value: 'exceptions', label: 'Exceptions', description: 'Low-score cases requiring follow-up' },
                        { value: 'records', label: 'All Records', description: 'Search and inspect detailed records' },
                    ] as const).map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setHeadquartersSection(item.value)}
                            aria-pressed={hqSection === item.value}
                            className={`rounded-xl px-4 py-3 text-left transition-colors ${hqSection === item.value ? 'bg-gray-950 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <span className="block text-sm font-black">{item.label}</span>
                            <span className={`mt-0.5 block text-[11px] font-medium ${hqSection === item.value ? 'text-gray-300' : 'text-gray-400'}`}>{item.description}</span>
                        </button>
                    ))}
                </nav>
            ) : null}

            {isOversightPortal && hasActiveFilters ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-amber-900">
                        <span>Active {oversightScopeLabel.toLowerCase()} filters:</span>
                        {searchParams.get('search') ? <Badge className="border-amber-200 bg-white text-amber-800">Search: {searchParams.get('search')}</Badge> : null}
                        {filterType ? <Badge className="border-amber-200 bg-white text-amber-800">Type: {filterType}</Badge> : null}
                        {scoreBand ? <Badge className="border-amber-200 bg-white text-amber-800">Score: {scoreBand}</Badge> : null}
                    </div>
                    <Button variant="ghost" size="sm" className="text-amber-800" onClick={clearAllFilters}>Clear filters</Button>
                </div>
            ) : null}

            {/* Auto-graduation warning */}
            {!isOversightPortal ? (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 rounded-2xl border border-amber-200 mx-4 sm:mx-0">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-amber-900">Auto-graduation notice</p>
                        <p className="text-xs text-amber-700 mt-0.5">Creating a new assessment automatically sets the learner's WEL status to "Completed". Ensure the learner is ready for completion before submitting.</p>
                    </div>
                </div>
            ) : null}

            {/* Stat Cards */}
            {isOversightPortal && hqSection !== 'overview' ? null : loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 px-4 sm:px-0">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[180px] rounded-[2rem]" />)}
                </div>
            ) : stats ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 px-4 sm:px-0">
                    {assessmentStatCards.map(({ label, value, Icon, detail }) => (
                        <div
                            key={label}
                            className="relative isolate flex min-h-[180px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FFD54A] via-[#FFB800] to-[#E69700] p-5 text-gray-950 shadow-xl shadow-[#C98200]/20"
                        >
                            <div className="absolute -bottom-16 -right-10 -z-10 h-40 w-40 rounded-full bg-[#C77700]/25 blur-2xl" />
                            <div className="flex w-full flex-col justify-between">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="pt-1 text-sm font-black uppercase tracking-wider text-gray-900/65">{label}</p>
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-gray-950 shadow-sm" aria-hidden="true">
                                        <ArrowUpRight className="h-6 w-6" strokeWidth={2.75} />
                                    </span>
                                </div>

                                <p className="text-5xl font-black leading-none tracking-tight">{value}</p>

                                <div className="flex items-center gap-3 text-sm font-bold text-gray-900/70">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-950/10 text-gray-950">
                                        <Icon className="h-4 w-4" strokeWidth={2.5} />
                                    </span>
                                    <span>{detail}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {isOversightPortal && hqSection === 'overview' && stats ? (
                <section className="grid grid-cols-1 gap-6 px-4 sm:px-0 lg:grid-cols-2" aria-label={`${oversightScopeLabel} competency assessment analytics`}>
                    <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
                        <CardHeader className="p-5 pb-0 md:p-7 md:pb-0">
                            <CardTitle className="text-xl font-black">Assessment Type Distribution</CardTitle>
                            <p className="mt-1 text-sm font-semibold text-gray-500">{oversightScopeLabel} mix of practical, theoretical, combined, and on-the-job assessments.</p>
                        </CardHeader>
                        <CardContent className="p-5 md:p-7">
                            {Object.values(stats.byType).some((value) => value > 0) ? (
                                <>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie
                                                data={Object.entries(stats.byType).map(([name, value]) => ({ name, value }))}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={62}
                                                outerRadius={94}
                                                paddingAngle={2}
                                                strokeWidth={2}
                                            >
                                                {Object.keys(stats.byType).map((name, index) => (
                                                    <Cell key={name} fill={ASSESSMENT_TYPE_COLORS[index % ASSESSMENT_TYPE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: number) => [value, 'Assessments']}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-3" aria-label="Assessment type totals">
                                        {Object.entries(stats.byType).map(([name, value], index) => (
                                            <div key={name} className="flex items-center gap-2">
                                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ASSESSMENT_TYPE_COLORS[index % ASSESSMENT_TYPE_COLORS.length] }} />
                                                <span className="text-sm font-bold text-gray-700">{name}: {value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="py-16 text-center text-sm font-semibold text-gray-400">No assessment-type data is available.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
                        <CardHeader className="p-5 pb-0 md:p-7 md:pb-0">
                            <CardTitle className="text-xl font-black">Competency Outcome Distribution</CardTitle>
                            <p className="mt-1 text-sm font-semibold text-gray-500">Learners grouped into high (70%+), mid (40–69%), and low (below 40%) outcomes.</p>
                        </CardHeader>
                        <CardContent className="p-5 md:p-7">
                            {(stats.scoreHigh + stats.scoreMid + stats.scoreLow) > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { name: 'High', value: stats.scoreHigh },
                                                    { name: 'Mid', value: stats.scoreMid },
                                                    { name: 'Low', value: stats.scoreLow },
                                                ]}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={94}
                                                strokeWidth={2}
                                            >
                                                {['High', 'Mid', 'Low'].map((name, index) => (
                                                    <Cell key={name} fill={ASSESSMENT_SCORE_COLORS[index]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: number) => [value, 'Assessments']}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-3" aria-label="Competency outcome totals">
                                        {[
                                            { name: 'High', value: stats.scoreHigh },
                                            { name: 'Mid', value: stats.scoreMid },
                                            { name: 'Low', value: stats.scoreLow },
                                        ].map((item, index) => (
                                            <div key={item.name} className="flex items-center gap-2">
                                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ASSESSMENT_SCORE_COLORS[index] }} />
                                                <span className="text-sm font-bold text-gray-700">{item.name}: {item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="py-16 text-center text-sm font-semibold text-gray-400">No competency outcome data is available.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
                        <CardHeader className="p-5 pb-0 md:p-7 md:pb-0">
                            <CardTitle className="text-xl font-black">Program Assessment Ranking</CardTitle>
                            <p className="mt-1 text-sm font-semibold text-gray-500">Eight programs with the highest assessment volume under the active filters.</p>
                        </CardHeader>
                        <CardContent className="p-5 md:p-7">
                            {stats.programRanking?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={stats.programRanking} margin={{ top: 16, right: 8, left: 0, bottom: 52 }}>
                                        <XAxis dataKey="program" interval={0} angle={-20} textAnchor="end" height={82} tick={{ fontSize: 10 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        <Bar dataKey="count" name="Assessments" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="py-16 text-center text-sm font-semibold text-gray-400">No program ranking data is available.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
                        <CardHeader className="p-5 pb-0 md:p-7 md:pb-0">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-xl font-black">Institutions Requiring Support</CardTitle>
                                    <p className="mt-1 text-sm font-semibold text-gray-500">Lowest average competency outcomes, ordered for {oversightPortalLabel.toLowerCase()} attention.</p>
                                </div>
                                <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => setHeadquartersSection('exceptions')}>Open exceptions</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 md:p-7">
                            {stats.institutionRanking?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={stats.institutionRanking} margin={{ top: 16, right: 8, left: 0, bottom: 52 }}>
                                        <XAxis dataKey="institution" interval={0} angle={-20} textAnchor="end" height={82} tick={{ fontSize: 10 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            formatter={(value: number, name: string) => [value, name === 'avgScore' ? 'Average score' : name]}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                        <Bar dataKey="avgScore" name="Average score" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="py-16 text-center text-sm font-semibold text-gray-400">No institution ranking data is available.</p>
                            )}
                        </CardContent>
                    </Card>
                </section>
            ) : null}

            {/* Search & Filter */}
            {(!isOversightPortal || hqSection !== 'overview') ? (
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
                {isOversightPortal && hqSection === 'records' ? (
                    <Select value={scoreBand} onValueChange={(value) => setFilter('scoreBand', value === 'all' ? '' : value)}>
                        <SelectTrigger className="h-10 w-[160px] rounded-xl border-gray-200 bg-white"><SelectValue placeholder="Score Band" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Scores</SelectItem>
                            <SelectItem value="high">High (70%+)</SelectItem>
                            <SelectItem value="mid">Mid (40–69%)</SelectItem>
                            <SelectItem value="low">Low (&lt;40%)</SelectItem>
                        </SelectContent>
                    </Select>
                ) : null}
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-gray-500 hover:text-gray-700 font-bold h-10"><X className="mr-1 h-3.5 w-3.5" /> Clear All</Button>
                )}
            </div>
            ) : null}

            {isOversightPortal && hqSection === 'exceptions' ? (
                <div className="mx-4 flex flex-col gap-3 rounded-2xl border border-red-100 bg-red-50 p-5 sm:mx-0 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="font-black text-red-900">Low competency outcomes</p>
                        <p className="mt-1 text-sm font-medium text-red-700">Showing assessments below 40% for regional and institutional follow-up.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge className="w-fit border-red-200 bg-white text-red-700">{totalAssessments} exception{totalAssessments === 1 ? '' : 's'}</Badge>
                        {totalAssessments > 10 ? (
                            <Button variant="outline" size="sm" className="rounded-xl border-red-200 bg-white text-red-700" onClick={openAllAssessmentExceptions}>View all {totalAssessments}</Button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* Table */}
            {(!isOversightPortal || hqSection !== 'overview') ? (
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
                        ) : isOversightPortal ? (
                            <p className="text-xs font-semibold text-gray-400">No {oversightScopeLabel.toLowerCase()} assessment records are available yet.</p>
                        ) : (
                            <Button variant="ghost" size="sm" onClick={() => { setEditingAssessment(null); setOpen(true) }} className="text-blue-600 hover:text-blue-700 font-bold">Create your first assessment →</Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                    <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-medium text-gray-500">
                            Showing {((page - 1) * effectivePageSize) + 1} - {Math.min(page * effectivePageSize, totalAssessments)} of <span className="font-bold text-gray-900">{totalAssessments}</span> assessments
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
            ) : null}

            {/* View Assessment Details Drawer */}
            <Sheet open={viewOpen} onOpenChange={setViewOpen}>
                <SheetContent side="right" className="w-full overflow-y-auto border-l border-slate-200 bg-white p-0 sm:max-w-2xl">
                    {viewingAssessment && (
                        <div className="p-8">
                            <SheetHeader className="mb-6 border-b border-gray-100 pb-5 text-left">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/10 rounded-xl">
                                        <ClipboardCheck className="h-6 w-6 text-amber-500" />
                                    </div>
                                    <div>
                                        <SheetTitle className="text-2xl font-black text-gray-900">Assessment Details</SheetTitle>
                                        <SheetDescription className="font-medium text-gray-500">
                                            Tracking ID: {viewingAssessment.trackingId}
                                        </SheetDescription>
                                    </div>
                                </div>
                            </SheetHeader>

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
                                                <p className="mt-1 text-xs font-semibold text-gray-500">{viewingAssessment.institution || 'No institution'} · {viewingAssessment.learner.program || 'No program'}</p>
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
                </SheetContent>
            </Sheet>

            {/* Form Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl sm:max-w-[800px] [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button:hover]:bg-gray-200 [&>button:hover]:text-gray-900">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                        <DialogTitle className="text-2xl font-black text-gray-900">{isEditingExistingAssessment ? 'Edit Assessment' : 'New Competency Assessment'}</DialogTitle>
                        <DialogDescription className="font-medium text-gray-500">
                            {isEditingExistingAssessment ? 'Update evaluation details.' : 'Register a new skills evaluation.'}
                        </DialogDescription>
                        </DialogHeader>
                        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
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
