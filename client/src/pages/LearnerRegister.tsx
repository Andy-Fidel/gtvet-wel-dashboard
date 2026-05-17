import { useEffect, useState, useRef } from "react"
import { type Learner, columns } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Plus, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Users, GraduationCap, BookOpen, Search, X } from "lucide-react"
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

const ALL_ACADEMIC_STATUSES = "__all_academic_statuses"
const ALL_INTAKE_YEARS = "__all_intake_years"
const ALL_PROGRAMS = "__all_programs"
const ALL_YEARS = "__all_years"
const ALL_WEL_STATUSES = "__all_wel_statuses"

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
  availableIntakeYears: string[]
  programOptions: string[]
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { authFetch, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const academicStatusFilter = searchParams.get("academicStatus") || ""
  const intakeYearFilter = searchParams.get("intakeAcademicYear") || ""
  const programFilter = searchParams.get("program") || ""
  const yearFilter = searchParams.get("year") || ""
  const welStatusFilter = searchParams.get("status") || ""

  // Debounced search — URL-synced
  const learnerSearchFilter = searchParams.get("search") || ""
  const [searchInput, setSearchInput] = useState(learnerSearchFilter)
  const [debouncedSearch, setDebouncedSearch] = useState(learnerSearchFilter)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput)
      const next = new URLSearchParams(searchParams)
      if (searchInput) next.set("search", searchInput)
      else next.delete("search")
      setSearchParams(next, { replace: true })
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

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
        if (debouncedSearch) params.set("search", debouncedSearch)
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))
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
        setLifecycleSummary(payload?.summary || { year1: 0, year2: 0, year3: 0, graduated: 0 })
      } catch (err) {
        console.error("Error fetching learners:", err);
        toast.error(err instanceof Error ? err.message : "Failed to load learners")
        setData([])
        setTotalLearners(0)
        setTotalPages(0)
        setAvailableIntakeYears([])
        setProgramOptions([])
        setLifecycleSummary({ year1: 0, year2: 0, year3: 0, graduated: 0 })
      } finally {
        setLoading(false);
      }
    };
    fetchLearners();
  }, [refreshKey, authFetch, academicStatusFilter, intakeYearFilter, programFilter, yearFilter, welStatusFilter, debouncedSearch, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [academicStatusFilter, intakeYearFilter, programFilter, yearFilter, welStatusFilter, debouncedSearch])

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

  return (
    <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
        {loading ? (
          <>{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</>
        ) : (
          <>
            <div className="rounded-2xl bg-white shadow-lg p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Year 1</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year1}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white shadow-lg p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Year 2</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year2}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white shadow-lg p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Year 3</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year3}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white shadow-lg p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Graduated</p>
                  <p className="text-3xl font-black text-indigo-700 mt-1">{lifecycleSummary.graduated}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <GraduationCap className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Users className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Learner Register
          </h2>
          <p className="text-muted-foreground">
            Manage and track all TVET learners in the system.
          </p>
          {user?.role !== 'SuperAdmin' ? (
            <p className="text-xs font-semibold text-indigo-600 mt-2">
              Learners now progress automatically after Semester 2 closes for the active academic year.
            </p>
          ) : null}
        </div>
        <div className="flex items-center space-x-2">
           {user?.role !== 'SuperAdmin' && (
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
           <Dialog open={open} onOpenChange={setOpen}>
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
           <Dialog open={csvOpen} onOpenChange={(open) => { setCsvOpen(open); if (!open) { setCsvData([]); setCsvResult(null); setCsvFileName("") } }}>
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
      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Learner"
        description="This action is permanent. The learner and all associated records will be removed from the system."
        confirmLabel="Delete Learner"
        variant="danger"
        onConfirm={confirmDelete}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-4 px-4 sm:px-0">
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
      </div>
      {(academicStatusFilter || intakeYearFilter || programFilter || yearFilter || welStatusFilter || searchInput) && (
        <div className="px-4 sm:px-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700 font-bold"
            onClick={() => { setSearchInput(''); setSearchParams(new URLSearchParams(), { replace: true }) }}
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Clear All Filters
          </Button>
        </div>
      )}
      {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-xl overflow-hidden p-6 space-y-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
      ) : (
          <div className="rounded-2xl border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
            <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-medium text-gray-500">
                Showing {data.length === 0 ? 0 : ((page - 1) * pageSize) + 1}
                {" "}-{" "}
                {Math.min(page * pageSize, totalLearners)}
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
              meta={{ onEdit: handleEdit, onDelete: handleDelete, role: user?.role }} 
            />
          </div>
      )}
    </div>
  )
}
