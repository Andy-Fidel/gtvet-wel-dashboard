
import {
  type ColumnDef,
} from "@tanstack/react-table"

import { useState, useEffect } from "react"
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
import { MoreHorizontal, Download, ShieldCheck, ShieldAlert, ShieldQuestion, AlertTriangle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { MonitoringVisitForm } from "./MonitoringVisitForm"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

export type MonitoringVisit = {
    _id: string
    visitDate: string
    visitType: string
    attendanceStatus: string
    performanceRating: number
    keyObservations: string
    issuesIdentified: string
    actionRequired: string
    locationVerified?: string
    distanceFromSite?: number
    learner: {
        name: string
        trackingId: string
        placement?: {
            location: string
            companyName: string
        }
    }
}

// eslint-disable-next-line react-refresh/only-export-components
export const columns: ColumnDef<MonitoringVisit>[] = [
  {
      accessorKey: "visitDate",
      header: "Visit Date",
      cell: ({ row }) => format(new Date(row.getValue("visitDate")), "PP"),
  },
  {
    accessorKey: "learner.trackingId",
    header: "Tracking ID",
  },
  {
    id: "name",
    accessorKey: "learner.name",
    header: "Learner Name",
  },
  {
    accessorKey: "learner.placement.companyName",
    header: "Company Name",
    cell: ({ row }) => row.original.learner.placement?.companyName || "N/A"
  },
  {
    accessorKey: "visitType",
    header: "Visit Type",
  },
  {
    accessorKey: "attendanceStatus",
    header: "Attendance",
    cell: ({ row }) => {
        const status = row.getValue("attendanceStatus") as string
        const color = status === 'Present' ? 'bg-green-500' : 'bg-red-500';
        return <Badge className={`${color} text-white`}>{status}</Badge>
    }
  },
  {
    accessorKey: "performanceRating",
    header: "Rating",
    cell: ({ row }) => {
        const rating = row.getValue("performanceRating") as number;
        return <div className="font-bold">{rating}/5</div>
    }
  },
  {
      accessorKey: "keyObservations",
      header: "Observations",
      cell: ({ row }) => <span className="truncate block max-w-[200px]">{row.getValue("keyObservations")}</span>
  },
  {
    accessorKey: "locationVerified",
    header: "Verification",
    cell: ({ row }) => {
      const status = row.original.locationVerified || 'No GPS';
      const dist = row.original.distanceFromSite;
      if (status === 'Verified') return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 rounded-lg font-bold gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
      );
      if (status === 'Unverified') return (
        <div className="space-y-0.5">
          <Badge className="bg-red-100 text-red-700 border-0 rounded-lg font-bold gap-1"><ShieldAlert className="h-3 w-3" /> Unverified</Badge>
          {dist && <div className="text-[10px] text-red-500 font-bold">{(dist / 1000).toFixed(1)}km away</div>}
        </div>
      );
      if (status === 'No Placement') return (
        <Badge className="bg-gray-100 text-gray-500 border-0 rounded-lg font-bold gap-1"><ShieldQuestion className="h-3 w-3" /> No Site</Badge>
      );
      return (
        <Badge className="bg-amber-100 text-amber-700 border-0 rounded-lg font-bold gap-1"><ShieldQuestion className="h-3 w-3" /> No GPS</Badge>
      );
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const visit = row.original
      const meta = table.options.meta as { 
        onEdit: (visit: MonitoringVisit) => void, 
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
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(visit._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(visit)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(visit._id)} className="text-red-600">Delete Visit</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export default function MonitoringVisits() {
    const [data, setData] = useState<MonitoringVisit[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingVisit, setEditingVisit] = useState<MonitoringVisit | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { authFetch, user } = useAuth()

    // Anomalies (admin only)
    interface Anomaly {
        type: string
        severity: string
        message: string
        date: string
        visit: { _id: string; learner?: { name: string; trackingId: string } }
    }
    const [anomalies, setAnomalies] = useState<Anomaly[]>([])
    const [showAnomalies, setShowAnomalies] = useState(false)
    const isAdmin = user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin'

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('/api/monitoring-visits')
                const data = await res.json()
                setData(data)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()

        // Fetch anomalies for admins
        if (isAdmin) {
            authFetch('/api/monitoring-visits/anomalies')
                .then(res => res.json())
                .then(data => Array.isArray(data) ? setAnomalies(data) : setAnomalies([]))
                .catch(() => setAnomalies([]))
        }
    }, [refreshKey, authFetch, isAdmin])

    const handleSuccess = () => {
        setOpen(false)
        setEditingVisit(null)
        setRefreshKey(prev => prev + 1)
    }

    const handleEdit = (visit: MonitoringVisit) => {
        setEditingVisit(visit)
        setOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this visit?")) {
            try {
                await authFetch(`/api/monitoring-visits/${id}`, { method: 'DELETE' })
                setRefreshKey(prev => prev + 1)
            } catch (error) {
                console.error("Error deleting visit:", error)
            }
        }
    }

    const handleExport = async () => {
        try {
            toast.info("Preparing export...");
            const res = await authFetch('/api/monitoring-visits/export');
            if (!res.ok) throw new Error("Failed to export");
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `visits_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Export downloaded successfully");
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export data");
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Monitoring Visits</h2>
                <p className="text-muted-foreground">
                    Track and review monitoring visits and learner performance.
                </p>
                </div>
                <div className="flex items-center space-x-4">
                    <Button onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                            <DialogTitle>{editingVisit ? 'Edit Visit' : 'Log Visit'}</DialogTitle>
                            <DialogDescription>
                                {editingVisit ? 'Update the visit details.' : 'Log a new monitoring visit.'}
                            </DialogDescription>
                            </DialogHeader>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <MonitoringVisitForm onSuccess={handleSuccess} initialData={editingVisit as any} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading monitoring visits...</div>
                ) : (
                    <DataTable 
                        exportTitle="Monitoring Visits Export"
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

            {/* Anomalies Section (Admin Only) */}
            {isAdmin && anomalies.length > 0 && (
                <div className="mt-6 rounded-none sm:rounded-2xl md:rounded-[2rem] border-y sm:border border-red-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-4 sm:p-6">
                    <button
                        onClick={() => setShowAnomalies(!showAnomalies)}
                        className="flex items-center justify-between w-full"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-lg font-black text-gray-900">Anomalies Detected</h3>
                                <p className="text-xs font-bold text-gray-400">{anomalies.length} suspicious pattern{anomalies.length !== 1 ? 's' : ''} found in the last 30 days</p>
                            </div>
                        </div>
                        <Badge className="bg-red-100 text-red-700 border-0 font-bold text-sm rounded-xl px-3">{anomalies.length}</Badge>
                    </button>
                    {showAnomalies && (
                        <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
                            {anomalies.map((a, i) => (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                                    a.severity === 'high' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                                }`}>
                                    <div className={`mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                                        a.severity === 'high' ? 'bg-red-200 text-red-700' : 'bg-amber-200 text-amber-700'
                                    }`}>
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={`text-[10px] font-black uppercase border-0 rounded-md ${
                                                a.type === 'location_mismatch' ? 'bg-red-200 text-red-800' :
                                                a.type === 'bulk_submission' ? 'bg-purple-200 text-purple-800' :
                                                a.type === 'off_hours' ? 'bg-amber-200 text-amber-800' :
                                                'bg-gray-200 text-gray-800'
                                            }`}>
                                                {a.type.replace('_', ' ')}
                                            </Badge>
                                            <span className="text-[10px] text-gray-400 font-bold">
                                                {a.visit?.learner?.name && `${a.visit.learner.name} · `}
                                                {new Date(a.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 mt-1">{a.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
