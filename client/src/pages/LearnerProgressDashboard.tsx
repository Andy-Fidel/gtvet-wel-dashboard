import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { Activity, AlertTriangle, TrendingUp, Users, Award, CheckCircle2, UserCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

interface LearnerProgress {
  learner: {
    _id: string
    name: string
    trackingId: string
    status: string
    academicStatus: string
    program: string
    year: string
    intakeAcademicYear?: string
    owner?: {
      _id: string
      name: string
      role: string
      institution?: string
    } | null
  }
  progress: {
    overall: number
    atRisk: boolean
    atRiskReasons: string[]
    categoryBreakdown: {
      placement: number
      assessment: number
      monitoring: number
      documentation: number
    }
  }
}

interface ProgressStats {
  totalLearners: number
  averageProgress: number
  atRiskCount: number
  completedCount: number
  placedCount: number
  academicSummary?: {
    currentEnrolled: number
    activeCount: number
    graduatingCount: number
    graduatedCount: number
    academicDroppedCount: number
  }
  intakeCohorts?: {
    intakeAcademicYear: string
    totalLearners: number
    currentEnrolled: number
    graduating: number
    graduated: number
    avgProgress: number
    atRiskCount: number
    riskLevel?: string
    riskReasons?: string[]
  }[]
}

const ALL_PROGRAMS = "__all_programs"
const ALL_YEARS = "__all_years"
const ALL_STATUSES = "__all_statuses"
const ALL_ACADEMIC_STATUSES = "__all_academic_statuses"
const ALL_INTAKE_YEARS = "__all_intake_years"
const ALL_RISK_STATES = "__all_risk_states"

export default function LearnerProgressDashboard() {
  const { authFetch, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [learners, setLearners] = useState<LearnerProgress[]>([])
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [ownerCandidates, setOwnerCandidates] = useState<Array<{ _id: string; name: string; role: string; institution?: string }>>([])
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({})
  const [savingOwners, setSavingOwners] = useState<Record<string, boolean>>({})
  const filterProgram = searchParams.get("program") || ""
  const filterYear = searchParams.get("year") || ""
  const filterStatus = searchParams.get("status") || ""
  const filterAcademicStatus = searchParams.get("academicStatus") || ""
  const filterIntakeAcademicYear = searchParams.get("intakeAcademicYear") || ""
  const filterRiskState = searchParams.get("risk") || ""
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const canManageOwnership = ["Admin", "Manager", "RegionalAdmin", "SuperAdmin"].includes(user?.role || "")

  useEffect(() => {
    fetchProgress()
  }, [filterProgram, filterYear, filterStatus, filterAcademicStatus, filterIntakeAcademicYear])

  useEffect(() => {
    if (!canManageOwnership) return

    authFetch("/api/ownership/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch ownership candidates")
        return res.json()
      })
      .then(setOwnerCandidates)
      .catch((error) => {
        console.error("Error fetching ownership candidates:", error)
      })
  }, [authFetch, canManageOwnership])

  useEffect(() => {
    setOwnerDrafts(
      Object.fromEntries(
        learners.map((lp) => [lp.learner._id, lp.learner.owner?._id || "__unassigned"])
      )
    )
  }, [learners])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterProgram, filterYear, filterStatus, filterAcademicStatus, filterIntakeAcademicYear])

  const fetchProgress = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterProgram) params.append("program", filterProgram)
      if (filterYear) params.append("year", filterYear)
      if (filterStatus) params.append("status", filterStatus)
      if (filterAcademicStatus) params.append("academicStatus", filterAcademicStatus)
      if (filterIntakeAcademicYear) params.append("intakeAcademicYear", filterIntakeAcademicYear)

      const res = await authFetch(`/api/learners/progress/bulk?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLearners(data.learners)
        setStats(data.stats)
      }
    } catch (err) {
      console.error("Error fetching progress:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredLearners = learners.filter((lp) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = (
      lp.learner.name.toLowerCase().includes(query) ||
      lp.learner.trackingId.toLowerCase().includes(query) ||
      lp.learner.program.toLowerCase().includes(query)
    )
    const matchesRisk = filterRiskState === "at-risk" ? lp.progress.atRisk : true
    return matchesSearch && matchesRisk
  })

  const assignedCount = filteredLearners.filter((lp) => Boolean(lp.learner.owner?._id)).length
  const unassignedCount = filteredLearners.length - assignedCount
  const atRiskOwnedCount = filteredLearners.filter((lp) => lp.progress.atRisk && lp.learner.owner?._id).length

  const totalPages = Math.max(1, Math.ceil(filteredLearners.length / itemsPerPage))
  const paginatedLearners = filteredLearners.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "text-emerald-600 bg-emerald-50"
    if (percentage >= 60) return "text-blue-600 bg-blue-50"
    if (percentage >= 40) return "text-amber-600 bg-amber-50"
    return "text-red-600 bg-red-50"
  }

  const statCards = [
    {
      title: "Current Enrolled",
      value: stats?.academicSummary?.currentEnrolled ?? stats?.totalLearners ?? 0,
      icon: Users,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
    {
      title: "Average Progress",
      value: `${stats?.averageProgress || 0}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      trend: stats && stats.averageProgress >= 60 ? "positive" : "neutral",
    },
    {
      title: "At Risk",
      value: stats?.atRiskCount || 0,
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      alert: Boolean(stats?.atRiskCount),
    },
    {
      title: "Graduated",
      value: stats?.academicSummary?.graduatedCount || 0,
      icon: Award,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
  ]

  const getWELStatusColor = (status: string) => {
    if (status === "Completed") return "bg-emerald-100 text-emerald-700"
    if (status === "Placed") return "bg-blue-100 text-blue-700"
    if (status === "Dropped") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-600"
  }

  const getAcademicStatusColor = (status: string) => {
    if (status === "Graduated") return "bg-emerald-100 text-emerald-700"
    if (status === "Graduating") return "bg-amber-100 text-amber-700"
    if (status === "Dropped") return "bg-rose-100 text-rose-700"
    return "bg-indigo-100 text-indigo-700"
  }

  const intakeAcademicYearOptions = Array.from(
    new Set(learners.map((lp) => lp.learner.intakeAcademicYear).filter(Boolean))
  ) as string[]
  intakeAcademicYearOptions.sort((a, b) => b.localeCompare(a))

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const saveLearnerOwner = async (learnerId: string) => {
    setSavingOwners((current) => ({ ...current, [learnerId]: true }))
    try {
      const res = await authFetch(`/api/learners/${learnerId}/owner`, {
        method: "PUT",
        body: JSON.stringify({
          ownerId: ownerDrafts[learnerId] === "__unassigned" ? null : ownerDrafts[learnerId],
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to update learner owner")
      toast.success("Learner owner updated")
      fetchProgress()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to update learner owner")
    } finally {
      setSavingOwners((current) => ({ ...current, [learnerId]: false }))
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Activity className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Learner Progress Dashboard
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">Track progress and identify at-risk learners.</p>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.title} className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  {stat.alert && (
                    <Badge className="bg-red-500 text-white animate-pulse">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Attention
                    </Badge>
                  )}
                  {stat.trend === "positive" && (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      On Track
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-gray-500 mt-2">{stat.title}</p>
                <p className="text-3xl font-black text-gray-900 mt-1">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="xl:col-span-1">
              <Input
                placeholder="Search learners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-gray-50 border-gray-200 rounded-xl"
              />
            </div>
            <div>
              <Select
                value={filterProgram || ALL_PROGRAMS}
                onValueChange={(value) => updateFilter("program", value === ALL_PROGRAMS ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Programs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROGRAMS}>All Programs</SelectItem>
                  <SelectItem value="Automotive Technology">Automotive Technology</SelectItem>
                  <SelectItem value="Electrical Installation">Electrical Installation</SelectItem>
                  <SelectItem value="Welding & Fabrication">Welding & Fabrication</SelectItem>
                  <SelectItem value="ICT">ICT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filterYear || ALL_YEARS}
                onValueChange={(value) => updateFilter("year", value === ALL_YEARS ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS}>All Years</SelectItem>
                  <SelectItem value="Year 1">Year 1</SelectItem>
                  <SelectItem value="Year 2">Year 2</SelectItem>
                  <SelectItem value="Year 3">Year 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filterStatus || ALL_STATUSES}
                onValueChange={(value) => updateFilter("status", value === ALL_STATUSES ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All WEL Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All WEL Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Placed">Placed</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filterAcademicStatus || ALL_ACADEMIC_STATUSES}
                onValueChange={(value) => updateFilter("academicStatus", value === ALL_ACADEMIC_STATUSES ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Academic Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACADEMIC_STATUSES}>All Academic Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Graduating">Graduating</SelectItem>
                  <SelectItem value="Graduated">Graduated</SelectItem>
                  <SelectItem value="Dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filterIntakeAcademicYear || ALL_INTAKE_YEARS}
                onValueChange={(value) => updateFilter("intakeAcademicYear", value === ALL_INTAKE_YEARS ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Intake Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_INTAKE_YEARS}>All Intake Years</SelectItem>
                  {intakeAcademicYearOptions.map((intakeYear) => (
                    <SelectItem key={intakeYear} value={intakeYear}>{intakeYear}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filterRiskState || ALL_RISK_STATES}
                onValueChange={(value) => updateFilter("risk", value === ALL_RISK_STATES ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Risk States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_RISK_STATES}>All Risk States</SelectItem>
                  <SelectItem value="at-risk">At Risk Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!loading && stats?.academicSummary && (
        <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900">Academic Lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: "Current Enrolled", value: stats.academicSummary.currentEnrolled, color: "bg-sky-50 text-sky-700" },
              { label: "Academic Active", value: stats.academicSummary.activeCount, color: "bg-indigo-50 text-indigo-700" },
              { label: "Graduating", value: stats.academicSummary.graduatingCount, color: "bg-amber-50 text-amber-700" },
              { label: "Graduated", value: stats.academicSummary.graduatedCount, color: "bg-emerald-50 text-emerald-700" },
              { label: "Academic Dropped", value: stats.academicSummary.academicDroppedCount, color: "bg-rose-50 text-rose-700" },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl px-4 py-5 ${item.color}`}>
                <p className="text-[11px] font-black uppercase tracking-widest">{item.label}</p>
                <p className="text-3xl font-black mt-2">{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && stats?.intakeCohorts && stats.intakeCohorts.length > 0 && (
        <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900">Cohort Comparison</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {stats.intakeCohorts.map((cohort) => (
              <div key={cohort.intakeAcademicYear} className="rounded-[1.5rem] border border-gray-100 bg-gray-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500">Intake {cohort.intakeAcademicYear}</span>
                  <Badge className="bg-white text-gray-700 border-gray-200">{cohort.totalLearners} learners</Badge>
                </div>
                {cohort.riskLevel && cohort.riskLevel !== 'low' && (
                  <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                    cohort.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {cohort.riskLevel} risk
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-sky-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Current</p>
                    <p className="mt-1 text-2xl font-black text-sky-700">{cohort.currentEnrolled}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Graduated</p>
                    <p className="mt-1 text-2xl font-black text-emerald-700">{cohort.graduated}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Progress</p>
                    <p className="mt-1 text-2xl font-black text-amber-700">{cohort.avgProgress}%</p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">At Risk</p>
                    <p className="mt-1 text-2xl font-black text-rose-700">{cohort.atRiskCount}</p>
                  </div>
                </div>
                {cohort.riskReasons && cohort.riskReasons.length > 0 && (
                  <p className="mt-3 text-xs font-bold text-gray-500">{cohort.riskReasons[0]}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900">Intervention Ownership</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-indigo-50 px-4 py-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-indigo-700">Assigned Queue</p>
              <p className="mt-2 text-3xl font-black text-indigo-700">{assignedCount}</p>
              <p className="mt-1 text-xs font-medium text-indigo-600">Learners in the current view with an owner</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Unassigned Queue</p>
              <p className="mt-2 text-3xl font-black text-amber-700">{unassignedCount}</p>
              <p className="mt-1 text-xs font-medium text-amber-600">Learners still needing a responsible staff owner</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-rose-700">At-Risk Owned</p>
              <p className="mt-2 text-3xl font-black text-rose-700">{atRiskOwnedCount}</p>
              <p className="mt-1 text-xs font-medium text-rose-600">At-risk learners already assigned for follow-up</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Table */}
      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Award className="h-5 w-5 text-[#FFB800]" />
            Individual Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredLearners.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No learners found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100">
                  <TableHead className="font-bold text-gray-500">Learner</TableHead>
                  <TableHead className="font-bold text-gray-500">Program</TableHead>
                  <TableHead className="font-bold text-gray-500">Owner</TableHead>
                  <TableHead className="font-bold text-gray-500">WEL Status</TableHead>
                  <TableHead className="font-bold text-gray-500">Academic Status</TableHead>
                  <TableHead className="font-bold text-gray-500">Progress</TableHead>
                  <TableHead className="font-bold text-gray-500">Category Breakdown</TableHead>
                  <TableHead className="font-bold text-gray-500 text-right">Risk Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLearners.map((lp) => (
                  <TableRow
                    key={lp.learner._id}
                    className="cursor-pointer hover:bg-gray-50 border-gray-100"
                    onClick={() => navigate(`/learners/${lp.learner._id}`)}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <div className="font-bold text-gray-900">{lp.learner.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{lp.learner.trackingId}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {lp.learner.program}
                      <div className="text-xs text-gray-400">{lp.learner.year}</div>
                      {lp.learner.intakeAcademicYear && (
                        <div className="text-xs text-gray-400">Intake {lp.learner.intakeAcademicYear}</div>
                      )}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-bold text-gray-900">{lp.learner.owner?.name || "Unassigned"}</span>
                        </div>
                        {lp.learner.owner?.role ? (
                          <p className="text-xs text-gray-500">{lp.learner.owner.role}</p>
                        ) : (
                          <p className="text-xs text-amber-600">Needs follow-up owner</p>
                        )}
                        {canManageOwnership ? (
                          <div className="flex flex-col gap-2">
                            <Select
                              value={ownerDrafts[lp.learner._id] || "__unassigned"}
                              onValueChange={(value) => setOwnerDrafts((current) => ({ ...current, [lp.learner._id]: value }))}
                            >
                              <SelectTrigger className="min-w-[220px] bg-white">
                                <SelectValue placeholder="Select owner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned">Unassigned</SelectItem>
                                {ownerCandidates.map((candidate) => (
                                  <SelectItem key={candidate._id} value={candidate._id}>
                                    {candidate.name} ({candidate.role})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              disabled={savingOwners[lp.learner._id]}
                              onClick={() => saveLearnerOwner(lp.learner._id)}
                            >
                              {savingOwners[lp.learner._id] ? "Saving…" : "Assign Owner"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${getWELStatusColor(lp.learner.status)}`}>
                        {lp.learner.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${getAcademicStatusColor(lp.learner.academicStatus)}`}>
                        {lp.learner.academicStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full ${getProgressColor(lp.progress.overall)} flex items-center justify-center`}>
                          <span className="text-sm font-black">{lp.progress.overall}%</span>
                        </div>
                        <div className="w-24">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                lp.progress.overall >= 80
                                  ? "bg-emerald-500"
                                  : lp.progress.overall >= 60
                                  ? "bg-blue-500"
                                  : lp.progress.overall >= 40
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${lp.progress.overall}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <div className="flex-1 h-8 rounded-lg overflow-hidden bg-gray-100">
                          <div
                            className="h-full bg-indigo-500"
                            style={{ width: `${lp.progress.categoryBreakdown.placement}%` }}
                            title={`Placement: ${lp.progress.categoryBreakdown.placement}%`}
                          />
                        </div>
                        <div className="flex-1 h-8 rounded-lg overflow-hidden bg-gray-100">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${lp.progress.categoryBreakdown.assessment}%` }}
                            title={`Assessment: ${lp.progress.categoryBreakdown.assessment}%`}
                          />
                        </div>
                        <div className="flex-1 h-8 rounded-lg overflow-hidden bg-gray-100">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${lp.progress.categoryBreakdown.monitoring}%` }}
                            title={`Monitoring: ${lp.progress.categoryBreakdown.monitoring}%`}
                          />
                        </div>
                        <div className="flex-1 h-8 rounded-lg overflow-hidden bg-gray-100">
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${lp.progress.categoryBreakdown.documentation}%` }}
                            title={`Documentation: ${lp.progress.categoryBreakdown.documentation}%`}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {lp.progress.atRisk ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {lp.progress.atRiskReasons.length} factors
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          On Track
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && filteredLearners.length > itemsPerPage && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-gray-500">
            Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredLearners.length)} of {filteredLearners.length} learners
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              variant="outline"
              className="w-10 h-10 p-0 rounded-xl border-gray-200 bg-white disabled:opacity-50"
            >
              ‹
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 p-0 rounded-xl font-bold ${
                  currentPage === page
                    ? "bg-[#FFB800] text-gray-900 hover:bg-[#e5a600]"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
                variant={currentPage === page ? "default" : "outline"}
              >
                {page}
              </Button>
            ))}
            <Button
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              variant="outline"
              className="w-10 h-10 p-0 rounded-xl border-gray-200 bg-white disabled:opacity-50"
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
