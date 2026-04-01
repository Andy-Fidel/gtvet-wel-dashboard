import {
  type SortingState,
} from "@tanstack/react-table"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditPlacementForm } from "./EditPlacementForm"
import { UnifiedPlacementForm } from "./UnifiedPlacementForm"
import { DataTable } from "@/components/ui/data-table"
import { type Placement, columns } from "./placements-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Download, Plus, AlignLeft, Building2, Users as UsersIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export type PlacementRequestData = {
  _id: string;
  institution: string;
  program: string;
  requestedSlots: number;
  status: 'Submitted' | 'Regional_Approved' | 'HQ_Approved' | 'Rejected' | 'Placed';
  createdAt: string;
  submittedBy: { name: string };
  partner: { name: string; sector: string; region: string; totalSlots: number; usedSlots: number };
  learners: { _id: string; firstName: string; lastName: string; trackingId: string }[];
  regionalComment?: string;
  hqComment?: string;
  rejectionReason?: string;
}

export default function Placements() {
    const [data, setData] = useState<Placement[]>([])
    const [requests, setRequests] = useState<PlacementRequestData[]>([])
    const [loading, setLoading] = useState(true)
    const [editOpen, setEditOpen] = useState(false)
    const [newOpen, setNewOpen] = useState(false)
    const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const { authFetch, user } = useAuth()
    
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [placementsRes, requestsRes] = await Promise.all([
                    authFetch('/api/placements'),
                    authFetch('/api/placement-requests')
                ])
                const [placementsData, requestsData] = await Promise.all([
                    placementsRes.json(),
                    requestsRes.json()
                ])
                setData(placementsData)
                setRequests(requestsData)
            } catch (err) {
                console.error(err)
                toast.error("Failed to load placement data")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch])

    const handleEditSuccess = () => {
        setEditOpen(false)
        setEditingPlacement(null)
        setRefreshKey(prev => prev + 1)
        toast.success("Placement updated successfully")
    }

    const handleNewSuccess = () => {
        setNewOpen(false)
        setRefreshKey(prev => prev + 1)
        toast.success("New placement created successfully")
    }
    
    const handleEdit = (placement: Placement) => {
        setEditingPlacement(placement)
        setEditOpen(true)
    }
    
    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this placement?")) {
            try {
                const res = await authFetch(`/api/placements/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("Placement deleted successfully")
            } catch (error) {
                console.error("Error deleting placement:", error)
                toast.error("Failed to delete placement")
            }
        }
    }

    const handleExport = async () => {
        try {
            toast.info("Preparing export...");
            const res = await authFetch('/api/placements/export');
            if (!res.ok) throw new Error("Failed to export");
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `placements_export_${new Date().toISOString().split('T')[0]}.csv`;
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

    const getStatusBadge = (status: string) => {
        switch (status) {
          case 'Submitted': return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Submitted</Badge>
          case 'Regional_Approved': return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Regional OK</Badge>
          case 'HQ_Approved': 
          case 'Placed': return <Badge className="bg-green-100 text-green-800 border-green-200">Placed</Badge>
          case 'Rejected': return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>
          default: return <Badge variant="outline">{status}</Badge>
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-6 pt-12 md:pt-16 pb-4 md:pb-8 flex w-full relative z-0">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 px-4 md:px-8">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Placements Hub</h2>
                  <p className="text-muted-foreground text-sm font-medium mt-1">
                      Manage all individual and batch workplace placements.
                  </p>
                </div>
                <div className="flex items-center space-x-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <Button onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold shrink-0">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    
                    {user?.role !== 'RegionalAdmin' && user?.role !== 'SuperAdmin' && (
                        <Button onClick={() => setNewOpen(true)} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-bold h-10 px-6 rounded-xl shadow-sm shrink-0">
                            <Plus className="mr-2 h-4 w-4" /> New Placement
                        </Button>
                    )}
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                    <DialogTitle>Edit Placement</DialogTitle>
                    <DialogDescription>Update the placement details for this learner.</DialogDescription>
                    </DialogHeader>
                    {editingPlacement && <EditPlacementForm onSuccess={handleEditSuccess} initialData={editingPlacement} />}
                </DialogContent>
            </Dialog>

            {/* New Unified Placement Dialog */}
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="sm:max-w-[700px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0 max-h-[90vh] overflow-y-auto">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-black">Initiate Placement Workflow</DialogTitle>
                            <DialogDescription className="font-medium text-gray-500">
                                Place learners directly with a registered partner or a custom organization.
                            </DialogDescription>
                        </DialogHeader>
                        <UnifiedPlacementForm onSuccess={handleNewSuccess} />
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex-1 w-full relative z-0 px-4 md:px-8 max-w-full">
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="bg-gray-100/50 p-1 rounded-2xl mb-6 inline-flex max-w-full overflow-x-auto">
                        <TabsTrigger value="all" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 transition-all shrink-0">
                            All Placements
                        </TabsTrigger>
                        <TabsTrigger value="batches" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 transition-all shrink-0">
                            Placement Batches / History
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-0 outline-none">
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden w-full relative z-0">
                            {loading ? (
                                <div className="p-4 space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : (
                                <div className="w-full relative z-0" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                                    <DataTable 
                                        exportTitle="Learner Placements Export"
                                        data={data} 
                                        columns={columns} 
                                        meta={{ 
                                            onEdit: handleEdit, 
                                            onDelete: handleDelete,
                                            role: user?.role
                                        }} 
                                        sorting={sorting}
                                        onSortingChange={setSorting}
                                    />
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="batches" className="mt-0 outline-none">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                <Skeleton className="h-[200px] w-full rounded-[2rem]" />
                                <Skeleton className="h-[200px] w-full rounded-[2rem]" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="w-full text-center p-16 bg-white/50 border border-dashed border-gray-300 rounded-[2.5rem]">
                            <AlignLeft className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-gray-500 tracking-tight">No batches found</h3>
                            <p className="text-gray-400 mt-2 font-medium">Placement batch records will appear here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                            {requests.map(req => (
                                <Card key={req._id} className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-[2rem] overflow-hidden group">
                                <div className={`h-2 w-full ${req.status === 'Rejected' ? 'bg-red-400' : req.status === 'Placed' || req.status === 'HQ_Approved' ? 'bg-green-400' : 'bg-amber-400'}`} />
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start gap-4">
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="text-lg md:text-xl font-black text-gray-900 truncate" title={req.partner?.name || 'Custom Placement'}>
                                            {req.partner?.name || 'Custom Placement'}
                                        </CardTitle>
                                        <CardDescription className="text-xs md:text-sm font-semibold mt-1 flex items-center gap-1.5 truncate">
                                            <Building2 className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" /> <span className="truncate">{req.institution}</span>
                                        </CardDescription>
                                    </div>
                                    <div className="flex-shrink-0">
                                        {getStatusBadge(req.status)}
                                    </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-2">
                                    <div className="flex flex-wrap gap-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <div className="w-full flex justify-between mb-1 items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Program</span>
                                        <span className="font-bold text-gray-900 truncate max-w-[150px] text-right">{req.program}</span>
                                    </div>
                                    <div className="w-full flex justify-between mb-1 items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Learners</span>
                                        <span className="font-bold text-gray-900 flex items-center gap-1"><UsersIcon className="h-3 w-3 md:h-4 md:w-4"/> {req.requestedSlots}</span>
                                    </div>
                                    <div className="w-full flex justify-between items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Date</span>
                                        <span className="font-bold text-gray-900 text-xs md:text-sm">{new Date(req.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    </div>

                                    {req.status === 'Rejected' && req.rejectionReason && (
                                        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs md:text-sm font-medium border border-red-100">
                                            <strong className="block mb-1 text-[10px] md:text-xs uppercase tracking-wider">Rejection Reason:</strong>
                                            {req.rejectionReason}
                                        </div>
                                    )}
                                </CardContent>
                                </Card>
                            ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
