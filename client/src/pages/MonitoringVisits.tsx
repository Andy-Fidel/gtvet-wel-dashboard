
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
import { MoreHorizontal, Plus } from "lucide-react"
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

export type MonitoringVisit = {
    _id: string
    visitDate: string
    visitorPosition: string
    visitType: string
    attendanceStatus: string
    performanceRating: number
    keyObservations: string
    issuesIdentified: string
    actionRequired: string
    learner: {
        name: string
        trackingId: string
        placement?: {
            location: string
        }
    }
}

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
    accessorKey: "learner.placement.location",
    header: "Company Name",
    cell: ({ row }) => row.original.learner.placement?.location || "N/A"
  },
  {
    accessorKey: "visitorPosition",
    header: "Visitor Position",
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

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const learnerId = queryParams.get("learnerId");
        if (learnerId) {
            setEditingVisit({ learner: learnerId } as any);
            setOpen(true);
        }
    }, [])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('http://localhost:5001/api/monitoring-visits')
                const data = await res.json()
                setData(data)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch])

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
                await authFetch(`http://localhost:5001/api/monitoring-visits/${id}`, { method: 'DELETE' })
                setRefreshKey(prev => prev + 1)
            } catch (error) {
                console.error("Error deleting visit:", error)
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
             <div className="flex items-center justify-between space-y-2">
                <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Monitoring Visits</h2>
                <p className="text-muted-foreground">
                    Track and review monitoring visits and learner performance.
                </p>
                </div>
                <div className="flex items-center space-x-2">
                    {user?.role !== 'SuperAdmin' && (
                        <Button onClick={() => { setEditingVisit(null); setOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                            <Plus className="mr-3 h-5 w-5" /> Add Visit
                        </Button>
                    )}
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                            <DialogTitle>{editingVisit ? 'Edit Visit' : 'Log Visit'}</DialogTitle>
                            <DialogDescription>
                                {editingVisit ? 'Update the visit details.' : 'Log a new monitoring visit.'}
                            </DialogDescription>
                            </DialogHeader>
                            <MonitoringVisitForm onSuccess={handleSuccess} initialData={editingVisit} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading monitoring visits...</div>
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
