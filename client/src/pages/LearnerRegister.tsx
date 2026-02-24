
import { useEffect, useState } from "react"
import { type Learner, columns } from "./learners/columns"
import { DataTable } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LearnerForm } from "./learners/LearnerForm"
import { useAuth } from "@/context/AuthContext"

export default function LearnerRegister() {
  const [data, setData] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingLearner, setEditingLearner] = useState<Learner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { authFetch, user } = useAuth()

  useEffect(() => {
    const fetchLearners = async () => {
      setLoading(true);
      try {
        const res = await authFetch('http://localhost:5001/api/learners');
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
              await authFetch(`http://localhost:5001/api/learners/${id}`, { method: 'DELETE' })
              setRefreshKey(prev => prev + 1)
          } catch (error) {
              console.error("Error deleting learner:", error)
          }
      }
  }

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Learner Register</h2>
          <p className="text-muted-foreground">
            Manage and track all TVET learners in the system.
          </p>
        </div>
        <div className="flex items-center space-x-2">
           {user?.role !== 'SuperAdmin' && (
             <Button onClick={() => { setEditingLearner(null); setOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
               <Plus className="mr-3 h-5 w-5" /> Add Learner
             </Button>
           )}
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
        </div>
      </div>
      {loading ? (
          <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2 text-center text-gray-500">Loading learners...</div>
      ) : (
          <div className="rounded-[2.5rem] border border-gray-100 bg-white shadow-xl overflow-hidden p-2">
            <DataTable 
              data={data} 
              columns={columns} 
              meta={{ onEdit: handleEdit, onDelete: handleDelete, role: user?.role }} 
            />
          </div>
      )}
    </div>
  )
}
