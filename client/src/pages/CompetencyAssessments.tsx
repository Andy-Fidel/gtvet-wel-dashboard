
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
import { MoreHorizontal, ClipboardCheck, Eye, Star, User, Calendar, Award, Wrench, MessageSquare } from "lucide-react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

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
        onView: (assessment: CompetencyAssessment) => void,
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
            <DropdownMenuItem onClick={() => meta?.onView(assessment)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
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
    const [viewOpen, setViewOpen] = useState(false)
    const [editingAssessment, setEditingAssessment] = useState<CompetencyAssessment | null>(null)
    const [viewingAssessment, setViewingAssessment] = useState<CompetencyAssessment | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { authFetch, user } = useAuth()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('/api/assessments')
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

    const handleView = (assessment: CompetencyAssessment) => {
        setViewingAssessment(assessment)
        setViewOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this assessment?")) {
            try {
                await authFetch(`/api/assessments/${id}`, { method: 'DELETE' })
                setRefreshKey(prev => prev + 1)
                toast.success("Assessment deleted")
            } catch (error) {
                console.error("Error deleting assessment:", error)
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl">
                        <ClipboardCheck className="h-8 w-8 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Competency Assessments</h2>
                        <p className="text-muted-foreground">
                            Evaluation of learner technical and soft skills.
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
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

            <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
                {loading ? (
                    <div className="p-8 text-center text-gray-500 font-bold">Loading assessments...</div>
                ) : (
                    <DataTable
                        exportTitle="Competency Assessments Report"
                        data={data}
                        columns={columns}
                        meta={{
                            onEdit: handleEdit,
                            onDelete: handleDelete,
                            onView: handleView,
                            role: user?.role
                        }}
                    />
                )}
            </div>

            {/* View Assessment Details Dialog */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0">
                    {viewingAssessment && (
                        <div className="p-8">
                            <DialogHeader className="mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/10 rounded-xl">
                                        <ClipboardCheck className="h-6 w-6 text-amber-500" />
                                    </div>
                                    <div>
                                        <DialogTitle className="text-2xl font-black text-gray-900">Assessment Details</DialogTitle>
                                        <DialogDescription className="font-medium text-gray-500">
                                            Tracking ID: {viewingAssessment.trackingId}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-6">
                                {/* Learner Info Card */}
                                <Card className="border-0 shadow-md bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
                                    <CardContent className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-[#FFB800] flex items-center justify-center text-white font-black text-lg">
                                                {viewingAssessment.learner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Learner</p>
                                                <p className="text-lg font-bold text-gray-900">{viewingAssessment.learner.name}</p>
                                            </div>
                                            <Badge variant="outline" className="font-bold border-amber-500 text-amber-600 bg-amber-50">
                                                {viewingAssessment.assessmentType}
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Assessment Details Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="border-0 shadow-sm bg-gray-50 rounded-xl">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                <p className="text-xs font-semibold text-gray-400 uppercase">Assessment Date</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">{format(new Date(viewingAssessment.assessmentDate), "PPP")}</p>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-0 shadow-sm bg-gray-50 rounded-xl">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="h-4 w-4 text-gray-400" />
                                                <p className="text-xs font-semibold text-gray-400 uppercase">Assessor</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">{viewingAssessment.assessorName}</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Separator />

                                {/* Skills Assessment */}
                                <Card className="border-0 shadow-md rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <Wrench className="h-5 w-5 text-[#FFB800]" />
                                            Skills Assessment
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0 space-y-4">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Technical Skills</p>
                                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl">{viewingAssessment.technicalSkills}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Soft Skills</p>
                                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl">{viewingAssessment.softSkills}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Scores */}
                                <Card className="border-0 shadow-md rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <Star className="h-5 w-5 text-[#FFB800]" />
                                            Performance Ratings
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="text-center p-4 bg-gray-50 rounded-xl">
                                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Professionalism</p>
                                                <div className="flex justify-center gap-0.5">
                                                    {[1,2,3,4,5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`h-5 w-5 ${star <= viewingAssessment.professionalism ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-lg font-black text-gray-900 mt-1">{viewingAssessment.professionalism}/5</p>
                                            </div>

                                            <div className="text-center p-4 bg-gray-50 rounded-xl">
                                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Problem Solving</p>
                                                <div className="flex justify-center gap-0.5">
                                                    {[1,2,3,4,5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`h-5 w-5 ${star <= viewingAssessment.problemSolving ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-lg font-black text-gray-900 mt-1">{viewingAssessment.problemSolving}/5</p>
                                            </div>

                                            <div className="text-center p-4 bg-amber-50 rounded-xl border-2 border-amber-200">
                                                <p className="text-xs font-semibold text-amber-600 uppercase mb-2">Overall Score</p>
                                                <div className="flex items-center justify-center gap-1">
                                                    <Award className="h-5 w-5 text-amber-500" />
                                                </div>
                                                <p className="text-2xl font-black text-amber-600">{viewingAssessment.overallScore}%</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Recommendations */}
                                {viewingAssessment.recommendations && (
                                    <Card className="border-0 shadow-md rounded-2xl">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                                <MessageSquare className="h-5 w-5 text-[#FFB800]" />
                                                Recommendations
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <p className="text-sm text-gray-700 bg-amber-50 p-4 rounded-xl border border-amber-100">
                                                {viewingAssessment.recommendations}
                                            </p>
                                        </CardContent>
                                    </Card>
                                )}

                                <div className="flex justify-end pt-4">
                                    <Button
                                        onClick={() => setViewOpen(false)}
                                        className="h-12 px-8 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
