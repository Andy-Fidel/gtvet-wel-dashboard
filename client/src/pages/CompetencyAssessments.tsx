
import {
  type ColumnDef,
} from "@tanstack/react-table"

import { useState, useEffect } from "react"
import { toast } from "sonner"
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
import { MoreHorizontal, Plus, ClipboardCheck } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { CompetencyAssessmentForm } from "./CompetencyAssessmentForm"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"

export type CompetencyAssessment = {
    _id: string
    assessmentDate: string
    trackingId: string
    assessmentType: 'Oral' | 'Practical'
    technicalSkills: string
    softSkills: string
    professionalism: number
    problemSolving: number
    overallScore: number
    assessorName: string
    recommendations?: string
    learner: {
        _id: string
        name: string
    }
}

export const columns: ColumnDef<CompetencyAssessment>[] = [
  {
      accessorKey: "assessmentDate",
      header: "Date",
      cell: ({ row }) => format(new Date(row.getValue("assessmentDate")), "PP"),
  },
  {
    accessorKey: "trackingId",
    header: "Tracking ID",
  },
  {
    accessorKey: "learner.name",
    header: "Learner Name",
  },
  {
    accessorKey: "assessmentType",
    header: "Type",
    cell: ({ row }) => {
        const type = row.getValue("assessmentType") as string
        return <Badge variant="outline" className="font-bold">{type}</Badge>
    }
  },
  {
    accessorKey: "overallScore",
    header: "Score",
    cell: ({ row }) => {
        const score = row.getValue("overallScore") as number;
        const color = score >= 4 ? 'text-green-600' : score >= 3 ? 'text-amber-600' : 'text-red-600';
        return <div className={`font-black ${color}`}>{score}/5</div>
    }
  },
  {
    accessorKey: "assessorName",
    header: "Assessor",
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const assessment = row.original
      const meta = table.options.meta as { 
        onEdit: (assessment: CompetencyAssessment) => void, 
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
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(assessment._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(assessment)}>Edit Assessment</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(assessment._id)} className="text-red-600">Delete Record</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

export default function CompetencyAssessments() {
    const [data, setData] = useState<CompetencyAssessment[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingAssessment, setEditingAssessment] = useState<CompetencyAssessment | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { authFetch, user } = useAuth()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('http://localhost:5001/api/assessments')
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
        setEditingAssessment(null)
        setRefreshKey(prev => prev + 1)
        toast.success(editingAssessment ? "Assessment updated" : "Assessment registered")
    }

    const handleEdit = (assessment: CompetencyAssessment) => {
        setEditingAssessment(assessment)
        setOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this assessment?")) {
            try {
                await authFetch(`http://localhost:5001/api/assessments/${id}`, { method: 'DELETE' })
                setRefreshKey(prev => prev + 1)
                toast.success("Assessment deleted")
            } catch (error) {
                console.error("Error deleting assessment:", error)
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
             <div className="flex items-center justify-between space-y-2">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl">
                        <ClipboardCheck className="h-8 w-8 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Competency Assessments</h2>
                        <p className="text-muted-foreground">
                            Evaluation of learner technical and soft skills.
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {user?.role !== 'SuperAdmin' && (
                        <Button onClick={() => { setEditingAssessment(null); setOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-white font-black h-12 px-8 rounded-2xl shadow-lg shadow-amber-500/20 hover:-translate-y-0.5 transition-all">
                            <Plus className="mr-3 h-5 w-5" /> New Assessment
                        </Button>
                    )}
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0">
                            <div className="p-8">
                                <DialogHeader className="mb-6">
                                <DialogTitle className="text-2xl font-black">{editingAssessment ? 'Edit Assessment' : 'New Competency Assessment'}</DialogTitle>
                                <DialogDescription className="font-bold text-gray-400">
                                    {editingAssessment ? 'Update evaluation details.' : 'Register a new skills evaluation.'}
                                </DialogDescription>
                                </DialogHeader>
                                <div className="bg-gray-900 p-8 rounded-[2rem] shadow-inner">
                                    <CompetencyAssessmentForm onSuccess={handleSuccess} initialData={editingAssessment as any} />
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2">
                {loading ? (
                    <div className="p-8 text-center text-gray-500 font-bold">Loading assessments...</div>
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
