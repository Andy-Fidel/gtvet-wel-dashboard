import {
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlacementForm } from "./PlacementForm"
import { DataTable } from "@/components/ui/data-table"
import { type Placement, columns } from "./placements-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

export default function Placements() {
    const [data, setData] = useState<Placement[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const { authFetch, user } = useAuth()
    
    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const learnerId = queryParams.get("learnerId");
        if (learnerId) {
            setEditingPlacement({ learner: learnerId } as any);
            setOpen(true);
            // Optionally, clear the query param after picking it up to avoid re-triggering on refresh
            // window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [])

    // Using useEffect to fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('http://localhost:5001/api/placements')
                const data = await res.json()
                setData(data)
            } catch (err) {
                console.error(err)
                toast.error("Failed to load placements")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch])

    const handleSuccess = () => {
        setOpen(false)
        setEditingPlacement(null)
        setRefreshKey(prev => prev + 1)
        toast.success(editingPlacement ? "Placement updated successfully" : "Placement created successfully")
    }
    
    const handleEdit = (placement: Placement) => {
        setEditingPlacement(placement)
        setOpen(true)
    }
    
    // Custom confirm dialog could be added here, using native confirm for now but wrapped in a promise/async flow if needed.
    // For a polish step, we can stick to native confirm but make the deletion async and toasted.
    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this placement?")) {
            try {
                const res = await authFetch(`http://localhost:5001/api/placements/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("Placement deleted successfully")
            } catch (error) {
                console.error("Error deleting placement:", error)
                toast.error("Failed to delete placement")
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
             <div className="flex items-center justify-between space-y-2">
                <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Workplace Placements</h2>
                <p className="text-muted-foreground">
                    Manage industry partners and learner placements.
                </p>
                </div>
                <div className="flex items-center space-x-2">
                    {user?.role !== 'SuperAdmin' && (
                        <Button onClick={() => { setEditingPlacement(null); setOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                            <Plus className="mr-3 h-5 w-5" /> Add Placement
                        </Button>
                    )}
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                            <DialogTitle>{editingPlacement ? 'Edit Placement' : 'Add New Placement'}</DialogTitle>
                            <DialogDescription>
                                {editingPlacement ? 'Update the placement details.' : 'Enter the details of the workplace placement.'}
                            </DialogDescription>
                            </DialogHeader>
                            <PlacementForm onSuccess={handleSuccess} initialData={editingPlacement} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2">
                {loading ? (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center space-x-4">
                           <Skeleton className="h-12 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
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
                        sorting={sorting}
                        onSortingChange={setSorting}
                    />
                )}
            </div>
        </div>
    )
}
