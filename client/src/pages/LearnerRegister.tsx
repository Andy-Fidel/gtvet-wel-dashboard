
import { useEffect, useState, useRef } from "react"
import { type Learner, columns } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Plus, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LearnerForm } from "./learners/LearnerForm"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

export default function LearnerRegister() {
  const [data, setData] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [editingLearner, setEditingLearner] = useState<Learner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { authFetch, user } = useAuth()

  useEffect(() => {
    const fetchLearners = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/learners');
        const data = await res.json();
        setData(data);
      } catch (err) {
        console.error("Error fetching learners:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLearners();
  }, [refreshKey, authFetch])

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

  return (
    <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
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
              <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>{editingLearner ? 'Edit Learner' : 'Add New Learner'}</DialogTitle>
                  <DialogDescription>
                    {editingLearner ? 'Update the learner details.' : 'Enter the details of the student to register them in the WEL system.'}
                  </DialogDescription>
                </DialogHeader>
                {/* @ts-expect-error - Type mismatch between Learner and FormValues */}
                <LearnerForm onSuccess={handleSuccess} initialData={editingLearner} />
              </DialogContent>
           </Dialog>

           {/* CSV Upload Dialog */}
           <Dialog open={csvOpen} onOpenChange={(open) => { setCsvOpen(open); if (!open) { setCsvData([]); setCsvResult(null) } }}>
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
                    <div className="max-h-[350px] overflow-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                            {Object.keys(csvData[0]).slice(0, 6).map(key => (
                              <th key={key} className="px-3 py-2 text-left font-bold text-gray-600 truncate max-w-[120px]">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.slice(0, 20).map((row, i) => (
                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                              {Object.values(row).slice(0, 6).map((val, j) => (
                                <td key={j} className="px-3 py-2 truncate max-w-[120px]">{val}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvData.length > 20 && (
                      <p className="text-xs text-gray-400 text-center">Showing first 20 of {csvData.length} rows</p>
                    )}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 font-bold">
                      Expected columns: <span className="font-mono">Last Name, First Name, Middle Name, Gender, Phone, Guardian Contact, Index Number, Program, Year</span>
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
      {loading ? (
          <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2 text-center text-gray-500">Loading learners...</div>
      ) : (
          <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
            <DataTable 
                exportTitle="Learner Register Export"
              data={data} 
              columns={columns} 
              meta={{ onEdit: handleEdit, onDelete: handleDelete, role: user?.role }} 
            />
          </div>
      )}
    </div>
  )
}
