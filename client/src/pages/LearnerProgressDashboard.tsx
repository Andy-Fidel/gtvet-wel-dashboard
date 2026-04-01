import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { Activity, AlertTriangle, TrendingUp, Users, Award, CheckCircle2 } from "lucide-react"
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
import { useNavigate } from "react-router-dom"

interface LearnerProgress {
  learner: {
    _id: string
    name: string
    trackingId: string
    status: string
    program: string
    year: string
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
}

const ALL_PROGRAMS = "__all_programs"
const ALL_YEARS = "__all_years"
const ALL_STATUSES = "__all_statuses"

export default function LearnerProgressDashboard() {
  const { authFetch } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [learners, setLearners] = useState<LearnerProgress[]>([])
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [filterProgram, setFilterProgram] = useState("")
  const [filterYear, setFilterYear] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    fetchProgress()
  }, [filterProgram, filterYear, filterStatus])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterProgram, filterYear, filterStatus])

  const fetchProgress = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterProgram) params.append("program", filterProgram)
      if (filterYear) params.append("year", filterYear)
      if (filterStatus) params.append("status", filterStatus)

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
    return (
      lp.learner.name.toLowerCase().includes(query) ||
      lp.learner.trackingId.toLowerCase().includes(query) ||
      lp.learner.program.toLowerCase().includes(query)
    )
  })

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
      title: "Total Learners",
      value: stats?.totalLearners || 0,
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
      title: "Completed",
      value: stats?.completedCount || 0,
      icon: CheckCircle2,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
  ]

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
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
                onValueChange={(value) => setFilterProgram(value === ALL_PROGRAMS ? "" : value)}
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
                onValueChange={(value) => setFilterYear(value === ALL_YEARS ? "" : value)}
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
                onValueChange={(value) => setFilterStatus(value === ALL_STATUSES ? "" : value)}
              >
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Placed">Placed</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="font-bold text-gray-500">Status</TableHead>
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
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border-0 ${
                          lp.learner.status === "Completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : lp.learner.status === "Placed"
                            ? "bg-blue-100 text-blue-700"
                            : lp.learner.status === "Dropped"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {lp.learner.status}
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
