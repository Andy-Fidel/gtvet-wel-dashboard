
import {
  type ColumnDef,
} from "@tanstack/react-table"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { 
  Plus, 
  FileText, 
  MoreHorizontal, 
  Pencil, 
  Trash2,
  Calendar as CalendarIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MonthlyReportForm } from "./MonthlyReportForm"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

export type MonthlyReport = {
    _id: string
    weekEnding: string
    trackingId: string
    taskCompleted: string
    skillsPracticed: string
    challengesFaced: string
    supervisorComments: string
    hoursWorked: number
    reportStatus: 'Draft' | 'Submitted' | 'Approved' | 'Rejected'
    learner: {
        _id: string
        name: string
    }
}

export const columns: ColumnDef<MonthlyReport>[] = [
  {
      accessorKey: "weekEnding",
      header: "Week Ending",
      cell: ({ row }) => format(new Date(row.getValue("weekEnding")), "PP"),
  },
  {
    accessorKey: "trackingId",
    header: "Tracking ID",
    cell: ({ row }) => <code className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded">{row.getValue("trackingId")}</code>
  },
  {
    id: "name",
    accessorKey: "learner.name",
    header: "Learner Name",
  },
  {
    accessorKey: "taskCompleted",
    header: "Tasks Completed",
    cell: ({ row }) => <span className="truncate block max-w-[150px]">{row.getValue("taskCompleted")}</span>
  },
  {
    accessorKey: "hoursWorked",
    header: "Hours",
  },
  {
    accessorKey: "reportStatus",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("reportStatus") as string
        let color = "bg-gray-500"
        if (status === 'Approved') color = "bg-green-600"
        if (status === 'Submitted') color = "bg-blue-600"
        if (status === 'Rejected') color = "bg-red-600"
        
        return <Badge className={`${color} text-white font-black border-0`}>{status}</Badge>
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const report = row.original
      const meta = table.options.meta as { 
        onEdit: (report: MonthlyReport) => void, 
        onDelete: (id: string) => void,
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
          <DropdownMenuContent align="end" className="rounded-xl border-gray-100 shadow-xl">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(report._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(report)} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(report._id)} className="text-red-600 gap-2">
                  <Trash2 className="h-3.5 w-3.5" /> Delete Report
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export default function MonthlyReports() {
    const [data, setData] = useState<MonthlyReport[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingReport, setEditingReport] = useState<MonthlyReport | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { authFetch, user } = useAuth()

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const learnerId = queryParams.get("learnerId");
        if (learnerId) {
            setEditingReport({ learner: learnerId } as any);
            setOpen(true);
        }
    }, [])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('http://localhost:5001/api/monthly-reports')
                if (!res.ok) throw new Error("Failed to fetch")
                const data = await res.json()
                setData(data)
            } catch (err) {
                console.error(err)
                toast.error("Failed to load reports")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch])

    const handleSuccess = () => {
        setOpen(false)
        setEditingReport(null)
        setRefreshKey(prev => prev + 1)
        toast.success(editingReport ? "Report updated successfully" : "Report saved successfully")
    }

    const handleEdit = (report: MonthlyReport) => {
        setEditingReport(report)
        setOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this report?")) {
            try {
                const res = await authFetch(`http://localhost:5001/api/monthly-reports/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("Report deleted successfully")
            } catch (error) {
                console.error("Error deleting report:", error)
                toast.error("Failed to delete report")
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
             <div className="flex items-center justify-between space-y-2">
                <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                   <FileText className="h-8 w-8 text-[#FFB800]" />
                   Monthly Reports
                </h2>
                <p className="text-muted-foreground">
                    Review and generate WEL monthly summaries.
                </p>
                </div>
                <div className="flex items-center space-x-2">
                    {user?.role !== 'SuperAdmin' && (
                        <Button onClick={() => { setEditingReport(null); setOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                            <Plus className="mr-3 h-5 w-5" /> Add Report
                        </Button>
                    )}
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0">
                            <div className="p-8">
                                <DialogHeader className="mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-[#FFB800]/10 rounded-2xl">
                                            <CalendarIcon className="h-6 w-6 text-[#FFB800]" />
                                        </div>
                                        <div>
                                            <DialogTitle className="text-2xl font-black">{editingReport ? 'Edit Monthly Report' : 'New Monthly Report'}</DialogTitle>
                                            <DialogDescription className="font-bold text-gray-400">
                                                {editingReport ? 'Refine the report details and status.' : 'Submit a new weekly task and skill summary.'}
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>
                                <MonthlyReportForm onSuccess={handleSuccess} initialData={editingReport} />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2">
                {loading ? (
                    <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full rounded-2xl" />
                        <Skeleton className="h-12 w-full rounded-2xl" />
                        <Skeleton className="h-12 w-full rounded-2xl" />
                    </div>
                ) : (
                    <DataTable 
                        data={data} 
                        columns={columns} 
                        meta={{ 
                            onEdit: handleEdit, 
                            onDelete: handleDelete,
                            role: user?.role 
                        }} 
                    />
                )}
            </div>
        </div>
    )
}
