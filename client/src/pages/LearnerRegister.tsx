import { useEffect, useState, useRef } from "react"
import { type Learner, columns } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Plus, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, GraduationCap, ArrowUpCircle } from "lucide-react"
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

const ALL_ACADEMIC_STATUSES = "__all_academic_statuses"
const ALL_INTAKE_YEARS = "__all_intake_years"

const normalizeStudyYear = (value?: string) => {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") || ""
  if (["year 1", "year1", "1", "first year", "year one"].includes(normalized)) return "Year 1"
  if (["year 2", "year2", "2", "second year", "year two"].includes(normalized)) return "Year 2"
  if (["year 3", "year3", "3", "third year", "year three"].includes(normalized)) return "Year 3"
  return value?.trim() || ""
}

export default function LearnerRegister() {
  const [data, setData] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [editingLearner, setEditingLearner] = useState<Learner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [csvFileName, setCsvFileName] = useState("")
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { authFetch, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const academicStatusFilter = searchParams.get("academicStatus") || ""
  const intakeYearFilter = searchParams.get("intakeAcademicYear") || ""
  const learnerSearchFilter = searchParams.get("search") || ""

  useEffect(() => {
    const fetchLearners = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams()
        if (academicStatusFilter) params.set("academicStatus", academicStatusFilter)
        if (intakeYearFilter) params.set("intakeAcademicYear", intakeYearFilter)
        const query = params.toString()
        const res = await authFetch(`/api/learners${query ? `?${query}` : ""}`);
        const data = await res.json();
        setData(data);
      } catch (err) {
        console.error("Error fetching learners:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLearners();
  }, [refreshKey, authFetch, academicStatusFilter, intakeYearFilter])

  const intakeYearOptions = Array.from(new Set(data.map((learner) => learner.intakeAcademicYear).filter(Boolean))) as string[]
  intakeYearOptions.sort((a, b) => b.localeCompare(a))
  if (intakeYearFilter && !intakeYearOptions.includes(intakeYearFilter)) {
    intakeYearOptions.unshift(intakeYearFilter)
  }

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const filteredData = data.filter((learner) => {
    const query = learnerSearchFilter.trim().toLowerCase()
    if (!query) return true

    return [
      learner.name,
      learner.trackingId,
      learner.indexNumber,
      learner.program,
    ].some((value) => value?.toLowerCase().includes(query))
  })

  const lifecycleSummary = {
    year1: filteredData.filter((learner) => normalizeStudyYear(learner.year) === "Year 1" && learner.academicStatus !== "Graduated").length,
    year2: filteredData.filter((learner) => normalizeStudyYear(learner.year) === "Year 2" && learner.academicStatus !== "Graduated").length,
    year3: filteredData.filter((learner) => normalizeStudyYear(learner.year) === "Year 3" && learner.academicStatus !== "Graduated").length,
    graduated: filteredData.filter((learner) => learner.academicStatus === "Graduated").length,
  }

  const handleSuccess = () => {
    setOpen(false)
    setEditingLearner(null)
    setRefreshKey(prev => prev + 1)
  }

  const handleEdit = (learner: Learner) => {
      setEditingLearner(learner)
      setOpen(true)
  }

  const handleDelete = async (id: string) => {
      if (confirm("Are you sure you want to delete this learner?")) {
          try {
              await authFetch(`/api/learners/${id}`, { method: 'DELETE' })
              setRefreshKey(prev => prev + 1)
          } catch (error) {
              console.error("Error deleting learner:", error)
          }
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
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
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

  const handleBulkPromotion = async (fromYear: "Year 1" | "Year 2") => {
    const label = fromYear === "Year 1" ? "Year 1 to Year 2" : "Year 2 to Year 3"
    if (!confirm(`Promote all eligible ${label} learners in your institution?`)) return

    try {
      const res = await authFetch('/api/learners/promote-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromYear }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Promotion failed")
      toast.success(`${payload.promoted || 0} learner(s) promoted`)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promotion failed")
    }
  }

  const handleBulkGraduation = async () => {
    if (!confirm("Graduate all eligible Year 3 learners in your institution?")) return

    try {
      const res = await authFetch('/api/learners/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Graduation failed")
      toast.success(`${payload.graduated || 0} learner(s) marked as graduated`)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Graduation failed")
    }
  }

  return (
    <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
      {user?.role !== 'SuperAdmin' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
          <div className="rounded-[2rem] bg-white shadow-lg p-5">
            <p className="text-sm text-gray-500">Year 1</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year1}</p>
          </div>
          <div className="rounded-[2rem] bg-white shadow-lg p-5">
            <p className="text-sm text-gray-500">Year 2</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year2}</p>
          </div>
          <div className="rounded-[2rem] bg-white shadow-lg p-5">
            <p className="text-sm text-gray-500">Year 3</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{lifecycleSummary.year3}</p>
          </div>
          <div className="rounded-[2rem] bg-white shadow-lg p-5">
            <p className="text-sm text-gray-500">Graduated</p>
            <p className="text-3xl font-black text-indigo-700 mt-1">{lifecycleSummary.graduated}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Learner Register</h2>
          <p className="text-muted-foreground">
            Manage and track all TVET learners in the system.
          </p>
        </div>
        <div className="flex items-center space-x-2">
           {user?.role !== 'SuperAdmin' && (
             <>
               <Button
                 onClick={() => handleBulkPromotion("Year 1")}
                 variant="outline"
                 className="font-black h-12 px-6 rounded-2xl border-gray-200"
               >
                 <ArrowUpCircle className="mr-2 h-5 w-5" /> Promote Year 1
               </Button>
               <Button
                 onClick={() => handleBulkPromotion("Year 2")}
                 variant="outline"
                 className="font-black h-12 px-6 rounded-2xl border-gray-200"
               >
                 <ArrowUpCircle className="mr-2 h-5 w-5" /> Promote Year 2
               </Button>
               <Button
                 onClick={handleBulkGraduation}
                 variant="outline"
                 className="font-black h-12 px-6 rounded-2xl border-gray-200"
               >
                 <GraduationCap className="mr-2 h-5 w-5" /> Graduate Year 3
               </Button>
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
              <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] bg-white text-gray-900 rounded-[2rem] border-none shadow-2xl [&>button]:text-gray-500 [&>button]:opacity-100 [&>button:hover]:text-gray-900">
                <DialogHeader className="pt-2">
                  <DialogTitle className="text-gray-900">{editingLearner ? 'Edit Learner' : 'Add New Learner'}</DialogTitle>
                  <DialogDescription className="text-gray-500">
                    {editingLearner ? 'Update learner profile, academic progression, and WEL status.' : 'Enter the details of the student to register them into the yearly learner lifecycle.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-[1.5rem] bg-white">
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Search Learners</label>
          <Input
            value={learnerSearchFilter}
            onChange={(e) => updateFilterParam("search", e.target.value)}
            placeholder="Name, tracking ID, index number..."
            className="rounded-xl border-gray-200 bg-gray-50"
          />
        </div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
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
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">Intake Academic Year</label>
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
        <div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm flex items-end">
          <Button
            variant="outline"
            className="w-full rounded-xl border-gray-200"
            onClick={() => setSearchParams({})}
            disabled={!academicStatusFilter && !intakeYearFilter && !learnerSearchFilter}
          >
            Clear Filters
          </Button>
        </div>
      </div>
      {loading ? (
          <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2 text-center text-gray-500">Loading learners...</div>
      ) : (
          <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
            <DataTable 
                exportTitle="Learner Register Export"
              data={filteredData} 
              columns={columns} 
              meta={{ onEdit: handleEdit, onDelete: handleDelete, role: user?.role }} 
            />
          </div>
      )}
    </div>
  )
}
