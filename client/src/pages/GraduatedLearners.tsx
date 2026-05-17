import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { GraduationCap, Archive, Search, CalendarRange, BookOpen, Download } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { useAuth } from "@/context/AuthContext"
import { type Learner } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

const ALL_INTAKE_YEARS = "__all_intake_years"
const ALL_PROGRAMS = "__all_programs"
const ALL_GRADUATION_YEARS = "__all_graduation_years"
const CHART_COLORS = ["#FFB800", "#2563EB", "#10B981", "#7C3AED", "#F97316", "#EF4444"]

const columns: ColumnDef<Learner>[] = [
  {
    accessorKey: "name",
    header: "Learner",
  },
  {
    accessorKey: "trackingId",
    header: "Tracking ID",
  },
  {
    accessorKey: "indexNumber",
    header: "Index Number",
  },
  {
    accessorKey: "program",
    header: "Program",
  },
  {
    accessorKey: "year",
    header: "Final Study Year",
  },
  {
    accessorKey: "intakeAcademicYear",
    header: "Intake Year",
  },
  {
    accessorKey: "graduationAcademicYear",
    header: "Graduation Year",
  },
  {
    accessorKey: "graduatedAt",
    header: "Graduated At",
    cell: ({ row }) => {
      const value = row.original.graduatedAt
      return <span>{value ? new Date(value).toLocaleDateString() : "Not recorded"}</span>
    },
    meta: {
      exportValue: (row: Learner) => row.graduatedAt ? new Date(row.graduatedAt).toLocaleDateString() : "Not recorded",
    },
  },
  {
    accessorKey: "academicStatus",
    header: "Academic Status",
    cell: ({ row }) => <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{row.original.academicStatus || "Graduated"}</Badge>,
  },
  {
    accessorKey: "status",
    header: "WEL Status",
    cell: ({ row }) => {
      const status = row.original.status
      const color = status === "Completed"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : status === "Placed"
          ? "bg-sky-100 text-sky-700 border-sky-200"
          : status === "Dropped"
            ? "bg-rose-100 text-rose-700 border-rose-200"
            : "bg-amber-100 text-amber-700 border-amber-200"
      return <Badge className={color}>{status}</Badge>
    },
  },
  {
    id: "profile",
    header: "Profile",
    cell: ({ row }) => (
      <Button asChild variant="outline" className="rounded-xl">
        <Link to={`/learners/${row.original._id}`}>Open Profile</Link>
      </Button>
    ),
    meta: {
      exportValue: () => "Profile available in portal",
    },
  },
]

export default function GraduatedLearners() {
  const { authFetch } = useAuth()
  const [data, setData] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [annualExporting, setAnnualExporting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const intakeYearFilter = searchParams.get("intakeAcademicYear") || ""
  const programFilter = searchParams.get("program") || ""
  const graduationYearFilter = searchParams.get("graduationAcademicYear") || ""
  const learnerSearchFilter = searchParams.get("search") || ""

  useEffect(() => {
    const fetchLearners = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("academicStatus", "Graduated")
        const res = await authFetch(`/api/learners?${params.toString()}`)
        const payload = await res.json()
        setData(Array.isArray(payload) ? payload : [])
      } catch (error) {
        console.error("Error fetching graduated learners:", error)
        toast.error("Failed to load graduated learners")
      } finally {
        setLoading(false)
      }
    }

    fetchLearners()
  }, [authFetch])

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const intakeYearOptions = useMemo(() => {
    const years = Array.from(new Set(data.map((learner) => learner.intakeAcademicYear).filter(Boolean))) as string[]
    years.sort((a, b) => b.localeCompare(a))
    if (intakeYearFilter && !years.includes(intakeYearFilter)) years.unshift(intakeYearFilter)
    return years
  }, [data, intakeYearFilter])

  const programOptions = useMemo(() => {
    const programs = Array.from(new Set(data.map((learner) => learner.program).filter(Boolean))) as string[]
    programs.sort((a, b) => a.localeCompare(b))
    if (programFilter && !programs.includes(programFilter)) programs.unshift(programFilter)
    return programs
  }, [data, programFilter])

  const graduationYearOptions = useMemo(() => {
    const years = Array.from(new Set(data.map((learner) => learner.graduationAcademicYear).filter(Boolean))) as string[]
    years.sort((a, b) => b.localeCompare(a))
    if (graduationYearFilter && !years.includes(graduationYearFilter)) years.unshift(graduationYearFilter)
    return years
  }, [data, graduationYearFilter])

  const filteredData = useMemo(() => {
    const query = learnerSearchFilter.trim().toLowerCase()
    return data.filter((learner) => {
      if (intakeYearFilter && learner.intakeAcademicYear !== intakeYearFilter) return false
      if (programFilter && learner.program !== programFilter) return false
      if (graduationYearFilter && learner.graduationAcademicYear !== graduationYearFilter) return false
      if (!query) return true

      return [
        learner.name,
        learner.trackingId,
        learner.indexNumber,
        learner.program,
        learner.graduationAcademicYear,
      ].some((value) => value?.toLowerCase().includes(query))
    })
  }, [data, graduationYearFilter, intakeYearFilter, learnerSearchFilter, programFilter])

  const summary = useMemo(() => ({
    total: filteredData.length,
    programs: new Set(filteredData.map((learner) => learner.program).filter(Boolean)).size,
    graduationYears: new Set(filteredData.map((learner) => learner.graduationAcademicYear).filter(Boolean)).size,
    completedWEL: filteredData.filter((learner) => learner.status === "Completed").length,
  }), [filteredData])

  const graduationYearTrend = useMemo(() => {
    const counts = filteredData.reduce<Record<string, number>>((acc, learner) => {
      const key = learner.graduationAcademicYear || "Unspecified"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    return Object.entries(counts)
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => b.year.localeCompare(a.year))
      .slice(0, 8)
      .reverse()
  }, [filteredData])

  const programDistribution = useMemo(() => {
    const counts = filteredData.reduce<Record<string, number>>((acc, learner) => {
      const key = learner.program || "Unspecified"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    return Object.entries(counts)
      .map(([program, total]) => ({ program, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [filteredData])

  const welOutcomeDistribution = useMemo(() => {
    const completed = filteredData.filter((learner) => learner.status === "Completed").length
    const placed = filteredData.filter((learner) => learner.status === "Placed").length
    const pending = filteredData.filter((learner) => learner.status === "Pending").length
    const dropped = filteredData.filter((learner) => learner.status === "Dropped").length

    return [
      { name: "Completed", value: completed, color: "#10B981" },
      { name: "Placed", value: placed, color: "#2563EB" },
      { name: "Pending", value: pending, color: "#F59E0B" },
      { name: "Dropped", value: dropped, color: "#EF4444" },
    ].filter((item) => item.value > 0)
  }, [filteredData])

  const handleArchiveExport = async () => {
    try {
      setExporting(true)
      const params = new URLSearchParams()
      if (intakeYearFilter) params.set("intakeAcademicYear", intakeYearFilter)
      if (programFilter) params.set("program", programFilter)
      if (learnerSearchFilter) params.set("search", learnerSearchFilter)

      const res = await authFetch(`/api/learners/graduated/export${params.toString() ? `?${params.toString()}` : ""}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || "Failed to export graduated learners")
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `graduated-learners-archive-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success("Graduated learner archive exported")
    } catch (error) {
      console.error("Graduated learner export failed:", error)
      toast.error(error instanceof Error ? error.message : "Failed to export graduated learners")
    } finally {
      setExporting(false)
    }
  }

  const handleAnnualReportExport = async () => {
    try {
      setAnnualExporting(true)
      const params = new URLSearchParams()
      if (programFilter) params.set("program", programFilter)
      if (graduationYearFilter) {
        params.set("graduationAcademicYear", graduationYearFilter)
      }

      const res = await authFetch(`/api/learners/graduated/annual-report${params.toString() ? `?${params.toString()}` : ""}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || "Failed to export annual alumni report")
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `graduated-learners-annual-report-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success("Annual alumni report exported")
    } catch (error) {
      console.error("Annual alumni report export failed:", error)
      toast.error(error instanceof Error ? error.message : "Failed to export annual alumni report")
    } finally {
      setAnnualExporting(false)
    }
  }

  return (
    <div className="h-full flex-1 flex-col space-y-6 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
      <div className="px-4 sm:px-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <GraduationCap className="h-7 w-7 text-[#FFB800]" />
            Graduated Learners
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">
            Review read-mostly graduate records, WEL completion history, and alumni-ready institutional archives.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleAnnualReportExport} disabled={annualExporting} variant="outline" className="rounded-2xl border-gray-200 bg-white hover:bg-gray-50 font-black">
            <Download className="mr-2 h-4 w-4" />
            {annualExporting ? "Exporting..." : "Annual Report"}
          </Button>
          <Button onClick={handleArchiveExport} disabled={exporting} variant="outline" className="rounded-2xl border-gray-200 bg-white hover:bg-gray-50 font-black">
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting..." : "Archive Export"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-5">
            <p className="text-sm text-gray-500">Graduated Records</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-5">
            <p className="text-sm text-gray-500">Programs</p>
            <p className="text-3xl font-black text-indigo-700 mt-1">{summary.programs}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-5">
            <p className="text-sm text-gray-500">Graduation Years</p>
            <p className="text-3xl font-black text-emerald-700 mt-1">{summary.graduationYears}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-5">
            <p className="text-sm text-gray-500">Completed WEL</p>
            <p className="text-3xl font-black text-amber-700 mt-1">{summary.completedWEL}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Search Archive</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={learnerSearchFilter}
              onChange={(e) => updateFilterParam("search", e.target.value)}
              placeholder="Name, tracking ID, program..."
              className="rounded-xl border-gray-200 bg-gray-50 pl-10"
            />
          </div>
        </div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Intake Year</label>
          <Select
            value={intakeYearFilter || ALL_INTAKE_YEARS}
            onValueChange={(value) => updateFilterParam("intakeAcademicYear", value === ALL_INTAKE_YEARS ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All intake years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_INTAKE_YEARS}>All intake years</SelectItem>
              {intakeYearOptions.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Program</label>
          <Select
            value={programFilter || ALL_PROGRAMS}
            onValueChange={(value) => updateFilterParam("program", value === ALL_PROGRAMS ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROGRAMS}>All programs</SelectItem>
              {programOptions.map((program) => (
                <SelectItem key={program} value={program}>{program}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Graduation Year</label>
          <Select
            value={graduationYearFilter || ALL_GRADUATION_YEARS}
            onValueChange={(value) => updateFilterParam("graduationAcademicYear", value === ALL_GRADUATION_YEARS ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All graduation years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GRADUATION_YEARS}>All graduation years</SelectItem>
              {graduationYearOptions.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm flex items-end">
          <Button
            variant="outline"
            className="w-full rounded-xl border-gray-200"
            onClick={() => setSearchParams({})}
            disabled={!intakeYearFilter && !programFilter && !graduationYearFilter && !learnerSearchFilter}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 px-4 sm:px-0">
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg xl:col-span-2">
          <CardContent className="p-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">Graduation Trend</p>
              <p className="text-lg font-black text-gray-900 mt-1">Graduates by academic year</p>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graduationYearTrend}>
                  <XAxis dataKey="year" stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} />
                  <Bar dataKey="total" radius={[12, 12, 0, 0]}>
                    {graduationYearTrend.map((entry, index) => (
                      <Cell key={entry.year} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">WEL Outcome Mix</p>
              <p className="text-lg font-black text-gray-900 mt-1">Graduate WEL status distribution</p>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={welOutcomeDistribution} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={4}>
                    {welOutcomeDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {welOutcomeDistribution.map((item) => (
                <Badge key={item.name} variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
                  {item.name}: {item.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 px-4 sm:px-0">
        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">Program Mix</p>
              <p className="text-lg font-black text-gray-900 mt-1">Top archived programs</p>
            </div>
            <div className="space-y-3">
              {programDistribution.length === 0 ? (
                <p className="text-sm text-gray-500">No program distribution available for the current filters.</p>
              ) : (
                programDistribution.map((item, index) => (
                  <div key={item.program} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{item.program}</p>
                        <p className="text-xs text-gray-500 mt-1">Archived graduates in this program</p>
                      </div>
                      <Badge className="border-0 text-white" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}>
                        {item.total}
                      </Badge>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${summary.total > 0 ? (item.total / summary.total) * 100 : 0}%`,
                          backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-gray-100 bg-white shadow-lg">
          <CardContent className="p-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">Archive Signals</p>
              <p className="text-lg font-black text-gray-900 mt-1">Quick archive interpretation</p>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Completed WEL Rate</p>
                <p className="mt-2 text-3xl font-black text-gray-900">
                  {summary.total > 0 ? Math.round((summary.completedWEL / summary.total) * 100) : 0}%
                </p>
                <p className="mt-1 text-sm text-emerald-800">Graduated learners whose WEL status closed as completed.</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-indigo-700">Archive Coverage</p>
                <p className="mt-2 text-3xl font-black text-gray-900">{summary.graduationYears}</p>
                <p className="mt-1 text-sm text-indigo-800">Graduation years represented in the current filtered archive slice.</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Program Breadth</p>
                <p className="mt-2 text-3xl font-black text-gray-900">{summary.programs}</p>
                <p className="mt-1 text-sm text-amber-800">Distinct programs represented in the archive view.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 sm:px-0">
        <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50/70 p-5">
          <div className="flex items-center gap-3">
            <Archive className="h-5 w-5 text-indigo-600" />
            <p className="text-sm font-black text-indigo-900">Institution Archive</p>
          </div>
          <p className="mt-2 text-sm text-indigo-800">Graduated learners stay in the portal as preserved institutional history rather than being deleted from operational records.</p>
        </div>
        <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/70 p-5">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-black text-emerald-900">Lifecycle Trace</p>
          </div>
          <p className="mt-2 text-sm text-emerald-800">Use learner profiles to inspect graduation year, progression history, WEL placements, assessments, and supporting records after completion.</p>
        </div>
        <div className="rounded-[2rem] border border-amber-100 bg-amber-50/70 p-5">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-black text-amber-900">Read-Mostly Review</p>
          </div>
          <p className="mt-2 text-sm text-amber-800">This page is designed for archive review and profile access rather than new learner intake or ongoing operational changes.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2 text-center text-gray-500">
          Loading graduated learners...
        </div>
      ) : (
        <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
          <DataTable
            exportTitle="Graduated Learners Export"
            data={filteredData}
            columns={columns}
            meta={{
              onEdit: () => {},
              onDelete: () => {},
              role: "SuperAdmin",
            }}
          />
        </div>
      )}
    </div>
  )
}
