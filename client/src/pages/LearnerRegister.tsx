import { isHQRole } from '@/lib/rbac'
import { useEffect, useState, useRef } from "react"
import { type Learner, columns } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Plus, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Users, GraduationCap, BookOpen, Search, X, ArrowUpRight, Building2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LearnerForm } from "./learners/LearnerForm"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmationDialog } from "@/components/ConfirmationDialog"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const ALL_ACADEMIC_STATUSES = "__all_academic_statuses"
const ALL_INTAKE_YEARS = "__all_intake_years"
const ALL_PROGRAMS = "__all_programs"
const ALL_YEARS = "__all_years"
const ALL_WEL_STATUSES = "__all_wel_statuses"
const ALL_INSTITUTIONS = "__all_institutions"
const LEARNER_DISTRIBUTION_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

type RegionalSection = "overview" | "exceptions" | "records"
type DistributionItem = { name: string; value: number }

type LearnerRegisterResponse = {
  items: Learner[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  summary: {
    year1: number
    year2: number
    year3: number
    graduated: number
  }
  analytics?: {
    gender: DistributionItem[]
    welStatus: DistributionItem[]
    programs: DistributionItem[]
    institutions: DistributionItem[]
  }
  availableIntakeYears: string[]
  programOptions: string[]
  institutionOptions: string[]
}

export default function LearnerRegister() {
  const [data, setData] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalLearners, setTotalLearners] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [availableIntakeYears, setAvailableIntakeYears] = useState<string[]>([])
  const [programOptions, setProgramOptions] = useState<string[]>([])
  const [institutionOptions, setInstitutionOptions] = useState<string[]>([])
  const [analytics, setAnalytics] = useState<LearnerRegisterResponse["analytics"]>(undefined)
  const [lifecycleSummary, setLifecycleSummary] = useState({ year1: 0, year2: 0, year3: 0, graduated: 0 })
  const [open, setOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [editingLearner, setEditingLearner] = useState<Learner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [csvFileName, setCsvFileName] = useState("")
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [viewingLearner, setViewingLearner] = useState<Learner | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { authFetch, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const academicStatusFilter = searchParams.get("academicStatus") || ""
  const intakeYearFilter = searchParams.get("intakeAcademicYear") || ""
  const programFilter = searchParams.get("program") || ""
  const yearFilter = searchParams.get("year") || ""
  const welStatusFilter = searchParams.get("status") || ""
  const institutionFilter = searchParams.get("institution") || ""
  const isRegionalOversight = user?.role === "RegionalAdmin"
  const requestedView = searchParams.get("view")
  const regionalSection: RegionalSection = requestedView === "exceptions" || requestedView === "records" ? requestedView : "overview"
  const effectivePageSize = isRegionalOversight && regionalSection === "exceptions" ? 10 : pageSize

  // Debounced search — URL-synced
  const learnerSearchFilter = searchParams.get("search") || ""
  const searchParamString = searchParams.toString()
  const [searchInput, setSearchInput] = useState(learnerSearchFilter)
  const [debouncedSearch, setDebouncedSearch] = useState(learnerSearchFilter)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput)
      const next = new URLSearchParams(searchParamString)
      if (searchInput) next.set("search", searchInput)
      else next.delete("search")
      setSearchParams(next, { replace: true })
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput, searchParamString, setSearchParams])

  useEffect(() => {
    const fetchLearners = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams()
        if (academicStatusFilter) params.set("academicStatus", academicStatusFilter)
        if (intakeYearFilter) params.set("intakeAcademicYear", intakeYearFilter)
        if (programFilter) params.set("program", programFilter)
        if (yearFilter) params.set("year", yearFilter)
        if (welStatusFilter) params.set("status", welStatusFilter)
        if (institutionFilter) params.set("institution", institutionFilter)
        if (debouncedSearch) params.set("search", debouncedSearch)
        params.set("page", String(page))
        params.set("pageSize", String(effectivePageSize))
        const query = params.toString()
        const res = await authFetch(`/api/learners${query ? `?${query}` : ""}`);
        const payload = await res.json().catch(() => null) as LearnerRegisterResponse | null
        if (!res.ok) {
          throw new Error(payload && "message" in payload ? String((payload as { message?: string }).message || "Failed to load learners") : "Failed to load learners")
        }
        setData(Array.isArray(payload?.items) ? payload.items : [])
        setTotalLearners(typeof payload?.total === "number" ? payload.total : 0)
        setTotalPages(typeof payload?.totalPages === "number" ? payload.totalPages : 0)
        setAvailableIntakeYears(Array.isArray(payload?.availableIntakeYears) ? payload.availableIntakeYears : [])
        setProgramOptions(Array.isArray(payload?.programOptions) ? payload.programOptions : [])
        setInstitutionOptions(Array.isArray(payload?.institutionOptions) ? payload.institutionOptions : [])
        setAnalytics(payload?.analytics)
        setLifecycleSummary(payload?.summary || { year1: 0, year2: 0, year3: 0, graduated: 0 })
      } catch (err) {
        console.error("Error fetching learners:", err);
        toast.error(err instanceof Error ? err.message : "Failed to load learners")
        setData([])
        setTotalLearners(0)
        setTotalPages(0)
        setAvailableIntakeYears([])
        setProgramOptions([])
        setInstitutionOptions([])
        setAnalytics(undefined)
        setLifecycleSummary({ year1: 0, year2: 0, year3: 0, graduated: 0 })
      } finally {
        setLoading(false);
      }
    };
    fetchLearners();
  }, [refreshKey, authFetch, academicStatusFilter, intakeYearFilter, programFilter, yearFilter, welStatusFilter, institutionFilter, debouncedSearch, page, effectivePageSize])

  useEffect(() => {
    setPage(1)
  }, [academicStatusFilter, intakeYearFilter, programFilter, yearFilter, welStatusFilter, institutionFilter, debouncedSearch])

  const intakeYearOptions = [...availableIntakeYears]
  if (intakeYearFilter && !intakeYearOptions.includes(intakeYearFilter)) {
    intakeYearOptions.unshift(intakeYearFilter)
  }

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const setRegionalSection = (section: RegionalSection) => {
    const next = new URLSearchParams(searchParams)
    next.set("view", section)
    if (section === "exceptions") next.set("status", "Pending")
    next.delete("page")
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const clearAllFilters = () => {
    setSearchInput("")
    const next = new URLSearchParams()
    if (isRegionalOversight) {
      next.set("view", regionalSection)
      if (regionalSection === "exceptions") next.set("status", "Pending")
    }
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const handleSuccess = () => {
    setOpen(false)
    setEditingLearner(null)
    setPage(1)
    setRefreshKey(prev => prev + 1)
  }

  const handleEdit = (learner: Learner) => {
      setEditingLearner(learner)
      setOpen(true)
  }

  const handleDelete = async (id: string) => {
    setDeleteTarget(id)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await authFetch(`/api/learners/${deleteTarget}`, { method: 'DELETE' })
      toast.success("Learner deleted successfully")
      if (data.length === 1 && page > 1) {
        setPage((prev) => prev - 1)
      } else {
        setRefreshKey(prev => prev + 1)
      }
    } catch (error) {
      console.error("Error deleting learner:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete learner")
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        toast.error("CSV file must have a header row and at least one data row")
        return
      }
      // CSV parser that handles quoted values with commas
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') { inQuotes = !inQuotes; continue }
          if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
          current += char
        }
        result.push(current.trim())
        return result
      }
      const headers = parseCsvLine(lines[0])
      const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line)
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = values[i] || '' })
        return obj
      })
      setCsvData(rows)
      setCsvResult(null)
      setCsvOpen(true)
    }
    reader.readAsText(file)
    // Reset the file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCsvUpload = async () => {
    setCsvUploading(true)
    try {
      const res = await authFetch('/api/learners/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learners: csvData }),
      })
      const result = await res.json()
      setCsvResult(result)
      if (result.created > 0) {
        toast.success(`${result.created} learner(s) created successfully!`)
        setRefreshKey(prev => prev + 1)
      }
      if (result.errors?.length > 0) {
        toast.error(`${result.errors.length} row(s) had errors`)
      }
    } catch {
      toast.error("Bulk upload failed")
    } finally {
      setCsvUploading(false)
    }
  }

  const lifecycleStats = [
    { label: "Year 1", value: lifecycleSummary.year1, Icon: BookOpen, detail: "Learners in this stage" },
    { label: "Year 2", value: lifecycleSummary.year2, Icon: BookOpen, detail: "Learners in this stage" },
    { label: "Year 3", value: lifecycleSummary.year3, Icon: BookOpen, detail: "Learners in this stage" },
    { label: "Graduated", value: lifecycleSummary.graduated, Icon: GraduationCap, detail: "Completed their programme" },
  ]
  const regionalExceptionCount = regionalSection === "exceptions"
    ? totalLearners
    : analytics?.welStatus.find((item) => item.name === "Pending")?.value || 0

  return (
    <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
      {(!isRegionalOversight || regionalSection === "overview") ? (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
        {loading ? (
          <>{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[180px] rounded-[2rem]" />)}</>
        ) : (
          lifecycleStats.map(({ label, value, Icon, detail }) => (
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
          ))
        )}
      </div>
      ) : null}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Users className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Learner Register
          </h2>
          <p className="text-muted-foreground">
            {isRegionalOversight
              ? "Regional learner participation, progression, placement readiness, and institutional oversight."
              : "Manage and track all TVET learners in the system."}
          </p>
          {!isRegionalOversight && !isHQRole(user?.role) ? (
            <p className="text-xs font-semibold text-indigo-600 mt-2">
              Learners now progress automatically after Semester 2 closes for the active academic year.
            </p>
          ) : null}
        </div>
        <div className="flex items-center space-x-2">
           {isRegionalOversight ? (
             <Badge className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700">Regional · Read only</Badge>
           ) : null}
           {!isRegionalOversight && !isHQRole(user?.role) && (
             <>
               <input
                 type="file"
                 accept=".csv"
                 ref={fileInputRef}
                 className="hidden"
                 onChange={handleFileSelect}
               />
               <Button
                 onClick={() => fileInputRef.current?.click()}
                 variant="outline"
                 className="font-black h-12 px-6 rounded-2xl border-gray-200"
               >
                 <Upload className="mr-2 h-5 w-5" /> CSV Upload
               </Button>
               <Button onClick={() => { setEditingLearner(null); setOpen(true); }} className="w-full sm:w-auto bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                 <Plus className="mr-3 h-5 w-5" /> Add Learner
               </Button>
             </>
           )}

           {/* Add Learner Dialog */}
           <Dialog open={open && !isRegionalOversight} onOpenChange={setOpen}>
               <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] bg-white text-gray-900 rounded-2xl border-none shadow-2xl [&>button]:text-gray-500 [&>button]:opacity-100 [&>button:hover]:text-gray-900">
                <DialogHeader className="pt-2">
                  <DialogTitle className="text-gray-900">{editingLearner ? 'Edit Learner' : 'Add New Learner'}</DialogTitle>
                  <DialogDescription className="text-gray-500">
                    {editingLearner ? 'Update learner profile, academic progression, and WEL status.' : 'Enter the details of the student to register them into the yearly learner lifecycle.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-2xl bg-white">
                  {/* @ts-expect-error - Type mismatch between Learner and FormValues */}
                  <LearnerForm onSuccess={handleSuccess} initialData={editingLearner} />
                </div>
              </DialogContent>
           </Dialog>

           {/* CSV Upload Dialog */}
           <Dialog open={csvOpen && !isRegionalOversight} onOpenChange={(open) => { setCsvOpen(open); if (!open) { setCsvData([]); setCsvResult(null); setCsvFileName("") } }}>
              <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-[#FFB800]" />
                    CSV Bulk Upload
                  </DialogTitle>
                  <DialogDescription>
                    Preview and upload {csvData.length} learner(s) from CSV file.
                  </DialogDescription>
                </DialogHeader>

                {/* CSV Preview Table */}
                {csvData.length > 0 && !csvResult && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Selected File</p>
                        <p className="mt-2 text-sm font-bold text-gray-900 break-all">{csvFileName || "Uploaded CSV"}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Rows Ready</p>
                        <p className="mt-2 text-2xl font-black text-gray-900">{csvData.length}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Preview Scope</p>
                        <p className="mt-2 text-sm font-bold text-gray-900">First {Math.min(csvData.length, 20)} row(s)</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-700">Required Columns</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["Last Name", "First Name", "Middle Name", "Gender", "Phone", "Guardian Contact", "Index Number", "Program", "Year"].map((column) => (
                          <span key={column} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-800">
                            {column}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">CSV Preview</p>
                        <p className="text-xs text-gray-500 mt-1">Scroll horizontally to inspect full headers and values.</p>
                      </div>
                      <div className="max-h-[350px] overflow-auto">
                        <table className="w-full min-w-[760px] text-xs">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                            {Object.keys(csvData[0]).slice(0, 6).map(key => (
                              <th key={key} className="px-3 py-2 text-left font-bold text-gray-600 min-w-[140px] whitespace-nowrap">{key}</th>
                            ))}
                          </tr>
                          </thead>
                          <tbody>
                            {csvData.slice(0, 20).map((row, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                                <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{i + 1}</td>
                                {Object.values(row).slice(0, 6).map((val, j) => (
                                  <td key={j} className="px-3 py-2 min-w-[140px] text-gray-700 break-words">{val || "—"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {csvData.length > 20 && (
                      <p className="text-xs text-gray-400 text-center">Showing first 20 of {csvData.length} rows</p>
                    )}
                    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-800">
                      <p className="font-bold">Before you upload</p>
                      <ul className="mt-2 space-y-1 text-xs text-sky-700">
                        <li>Use the first row for column headers.</li>
                        <li>Check the preview for empty or shifted values before submitting.</li>
                        <li>Only the first 6 columns are shown in the preview table, but all uploaded columns are still submitted.</li>
                      </ul>
                    </div>
                    <Button
                      onClick={handleCsvUpload}
                      disabled={csvUploading}
                      className="w-full bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 rounded-2xl"
                    >
                      {csvUploading ? 'Uploading...' : `Upload ${csvData.length} Learner(s)`}
                    </Button>
                  </div>
                )}

                {/* Upload Results */}
                {csvResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <div>
                        <p className="font-bold text-green-800">{csvResult.created} learner(s) created successfully</p>
                      </div>
                    </div>
                    {csvResult.errors.length > 0 && (
                      <div className="p-4 bg-red-50 rounded-xl space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <p className="font-bold text-red-700">{csvResult.errors.length} row(s) failed</p>
                        </div>
                        <div className="max-h-[150px] overflow-auto text-xs text-red-600 space-y-1">
                          {csvResult.errors.map((err, i) => (
                            <p key={i}>Row {err.row}: {err.message}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button onClick={() => { setCsvOpen(false); setCsvData([]); setCsvResult(null) }} className="w-full rounded-2xl" variant="outline">
                      Close
                    </Button>
                  </div>
                )}
              </DialogContent>
           </Dialog>
        </div>
      </div>

      {isRegionalOversight ? (
        <nav className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm sm:grid-cols-3" aria-label="Regional learner views">
          {([
            { value: "overview", label: "Overview", description: "Regional participation and distribution" },
            { value: "exceptions", label: "Exceptions", description: `${regionalExceptionCount} pending learner${regionalExceptionCount === 1 ? "" : "s"}` },
            { value: "records", label: "All Records", description: "Search and inspect learner records" },
          ] as const).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRegionalSection(item.value)}
              aria-pressed={regionalSection === item.value}
              className={`rounded-xl px-4 py-3 text-left transition-colors ${regionalSection === item.value ? "bg-gray-950 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <span className="block text-sm font-black">{item.label}</span>
              <span className={`mt-0.5 block text-[11px] font-medium ${regionalSection === item.value ? "text-gray-300" : "text-gray-400"}`}>{item.description}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {isRegionalOversight && regionalSection === "overview" && analytics ? (
        <section className="grid grid-cols-1 gap-6 px-4 sm:px-0 lg:grid-cols-2" aria-label="Regional learner analytics">
          {[
            { title: "Gender Distribution", description: "Regional learner representation by recorded gender.", data: analytics.gender },
            { title: "WEL Status Distribution", description: "Placement workflow position across learners in the region.", data: analytics.welStatus },
          ].map((chart) => {
            const visibleData = chart.data.filter((item) => item.value > 0)
            return (
              <div key={chart.title} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white p-5 shadow-xl md:p-7">
                <h3 className="text-xl font-black text-gray-900">{chart.title}</h3>
                <p className="mt-1 text-sm font-semibold text-gray-500">{chart.description}</p>
                {visibleData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={visibleData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} strokeWidth={2}>
                          {visibleData.map((item, index) => <Cell key={item.name} fill={LEARNER_DISTRIBUTION_COLORS[index % LEARNER_DISTRIBUTION_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => [value, "Learners"]} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-3">
                      {visibleData.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: LEARNER_DISTRIBUTION_COLORS[index % LEARNER_DISTRIBUTION_COLORS.length] }} />
                          <span className="text-sm font-bold text-gray-700">{item.name}: {item.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="py-16 text-center text-sm font-semibold text-gray-400">No data is available.</p>}
              </div>
            )
          })}

          {[
            { title: "Institution Learner Ranking", description: "Eight institutions with the largest learner populations under the active filters.", data: analytics.institutions, color: "#2563eb" },
            { title: "Program Learner Ranking", description: "Eight programs with the largest learner populations under the active filters.", data: analytics.programs, color: "#8b5cf6" },
          ].map((chart) => (
            <div key={chart.title} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white p-5 shadow-xl md:p-7">
              <h3 className="text-xl font-black text-gray-900">{chart.title}</h3>
              <p className="mt-1 text-sm font-semibold text-gray-500">{chart.description}</p>
              {chart.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chart.data} margin={{ top: 20, right: 8, left: 0, bottom: 56 }}>
                    <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={88} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                    <Bar dataKey="value" name="Learners" fill={chart.color} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="py-16 text-center text-sm font-semibold text-gray-400">No ranking data is available.</p>}
            </div>
          ))}
        </section>
      ) : null}
      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(deleteTarget) && !isRegionalOversight}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Learner"
        description="This action is permanent. The learner and all associated records will be removed from the system."
        confirmLabel="Delete Learner"
        variant="danger"
        onConfirm={confirmDelete}
      />

      {(!isRegionalOversight || regionalSection !== "overview") ? (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-8 gap-4 px-4 sm:px-0">
        <div className="xl:col-span-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Search Learners</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, tracking ID, index number..."
              className="rounded-xl border-gray-200 bg-gray-50 pl-9"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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
              {programOptions.map((prog) => (
                <SelectItem key={prog} value={prog}>{prog}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Academic Status</label>
          <Select
            value={academicStatusFilter || ALL_ACADEMIC_STATUSES}
            onValueChange={(value) => updateFilterParam("academicStatus", value === ALL_ACADEMIC_STATUSES ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All academic statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACADEMIC_STATUSES}>All academic statuses</SelectItem>
              <SelectItem value="CurrentEnrolled">Current enrolled</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Graduating">Graduating</SelectItem>
              <SelectItem value="Graduated">Graduated</SelectItem>
              <SelectItem value="Dropped">Dropped</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Year</label>
          <Select
            value={yearFilter || ALL_YEARS}
            onValueChange={(value) => updateFilterParam("year", value === ALL_YEARS ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_YEARS}>All years</SelectItem>
              <SelectItem value="Year 1">Year 1</SelectItem>
              <SelectItem value="Year 2">Year 2</SelectItem>
              <SelectItem value="Year 3">Year 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">WEL Status</label>
          <Select
            value={welStatusFilter || ALL_WEL_STATUSES}
            onValueChange={(value) => updateFilterParam("status", value === ALL_WEL_STATUSES ? "" : value)}
          >
            <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WEL_STATUSES}>All statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Placed">Placed</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Dropped">Dropped</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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
        {isRegionalOversight ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Institution</label>
            <Select
              value={institutionFilter || ALL_INSTITUTIONS}
              onValueChange={(value) => updateFilterParam("institution", value === ALL_INSTITUTIONS ? "" : value)}
            >
              <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                <SelectValue placeholder="All institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_INSTITUTIONS}>All institutions</SelectItem>
                {institutionOptions.map((institution) => (
                  <SelectItem key={institution} value={institution}>{institution}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {(academicStatusFilter || intakeYearFilter || programFilter || yearFilter || welStatusFilter || institutionFilter || searchInput) && (
        <div className="px-4 sm:px-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700 font-bold"
            onClick={clearAllFilters}
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Clear All Filters
          </Button>
        </div>
      )}
      </>
      ) : null}

      {isRegionalOversight && regionalSection === "exceptions" ? (
        <div className="mx-4 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-5 sm:mx-0 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-amber-900">Learners awaiting placement progression</p>
            <p className="mt-1 text-sm font-medium text-amber-700">Showing up to 10 pending learners for institutional follow-up.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border-amber-200 bg-white text-amber-700">{totalLearners} exception{totalLearners === 1 ? "" : "s"}</Badge>
            {totalLearners > 10 ? (
              <Button variant="outline" size="sm" className="rounded-xl border-amber-200 bg-white text-amber-700" onClick={() => setRegionalSection("records")}>View all {totalLearners}</Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isRegionalOversight && regionalSection === "overview" ? null : (
      loading ? (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-xl overflow-hidden p-6 space-y-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
      ) : (
          <div className="rounded-2xl border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
            <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-medium text-gray-500">
                Showing {data.length === 0 ? 0 : ((page - 1) * effectivePageSize) + 1}
                {" "}-{" "}
                {Math.min(page * effectivePageSize, totalLearners)}
                {" "}of{" "}
                <span className="font-bold text-gray-900">{totalLearners}</span> learners
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
              exportTitle="Learner Register Export"
              data={data}
              disablePagination
              columns={columns} 
              meta={{ onEdit: handleEdit, onDelete: handleDelete, onView: setViewingLearner, role: user?.role }}
            />
          </div>
      )
      )}

      <Sheet open={Boolean(viewingLearner)} onOpenChange={(open) => { if (!open) setViewingLearner(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-slate-200 bg-white p-0 sm:max-w-xl">
          {viewingLearner ? (
            <div className="p-6 sm:p-8">
              <SheetHeader className="border-b border-gray-100 pb-5 text-left">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Users className="h-5 w-5" /></span>
                  <div>
                    <SheetTitle className="text-2xl font-black text-gray-900">{viewingLearner.name}</SheetTitle>
                    <SheetDescription>{viewingLearner.trackingId} · Regional read-only record</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Institution", value: viewingLearner.institution || "N/A", Icon: Building2 },
                  { label: "Program", value: viewingLearner.program || "N/A", Icon: BookOpen },
                  { label: "Study Year", value: viewingLearner.year || "N/A", Icon: GraduationCap },
                  { label: "Gender", value: viewingLearner.gender || "N/A", Icon: Users },
                  { label: "Academic Status", value: viewingLearner.academicStatus || "Active", Icon: GraduationCap },
                  { label: "WEL Status", value: viewingLearner.status || "N/A", Icon: CheckCircle2 },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center gap-2 text-gray-500"><Icon className="h-4 w-4" /><p className="text-xs font-black uppercase tracking-wider">{label}</p></div>
                    <p className="mt-2 text-sm font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className={`mt-6 rounded-2xl border p-5 ${viewingLearner.readiness?.isReadyForPlacement ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                <p className="font-black text-gray-900">Placement readiness</p>
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {viewingLearner.readiness?.isReadyForPlacement
                    ? "This learner meets the recorded placement-readiness requirements."
                    : `${viewingLearner.readiness?.missingFields.length || 0} profile issue(s) and ${viewingLearner.readiness?.missingDocuments.length || 0} document issue(s) require institution follow-up.`}
                </p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
