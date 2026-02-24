
import {
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Plus, Users as UsersIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserForm } from "./UserForm"
import { DataTable } from "@/components/ui/data-table"
import { type User, columns } from "./user-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

export default function Users() {
    const [data, setData] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const { authFetch } = useAuth()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('http://localhost:5001/api/users')
                if (!res.ok) throw new Error("Failed to fetch")
                const data = await res.json()
                setData(data)
            } catch (err) {
                console.error(err)
                toast.error("Failed to load users")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch])

    const handleSuccess = () => {
        setOpen(false)
        setEditingUser(null)
        setRefreshKey(prev => prev + 1)
        toast.success(editingUser ? "User updated successfully" : "User created successfully")
    }
    
    const handleEdit = (user: User) => {
        setEditingUser(user)
        setOpen(true)
    }
    
    const handleToggleStatus = async (user: User) => {
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active'
        try {
            const res = await authFetch(`http://localhost:5001/api/users/${user._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })
            if (!res.ok) throw new Error("Failed to update status")
            setRefreshKey(prev => prev + 1)
            toast.success(`User marked as ${newStatus}`)
        } catch (error) {
            console.error("Error toggling status:", error)
            toast.error("Failed to update user status")
        }
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this user?")) {
            try {
                const res = await authFetch(`http://localhost:5001/api/users/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("User deleted successfully")
            } catch (error) {
                console.error("Error deleting user:", error)
                toast.error("Failed to delete user")
            }
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
             <div className="flex items-center justify-between space-y-2">
                <div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                   <UsersIcon className="h-8 w-8 text-[#FFB800]" />
                   User Management
                </h2>
                <p className="text-muted-foreground">
                    Manage system users, roles, and access levels.
                </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button onClick={() => { setEditingUser(null); setOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                        <Plus className="mr-3 h-5 w-5" /> Add User
                    </Button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                            <DialogDescription>
                                {editingUser ? 'Update the user details and role.' : 'Enter the details of the new system user.'}
                            </DialogDescription>
                            </DialogHeader>
                            <UserForm onSuccess={handleSuccess} initialData={editingUser as any || undefined} />
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
                            onToggleStatus: handleToggleStatus 
                        }} 
                        sorting={sorting}
                        onSortingChange={setSorting}
                    />
                )}
            </div>
        </div>
    )
}
