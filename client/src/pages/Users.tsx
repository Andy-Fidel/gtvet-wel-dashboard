
import {
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { Plus, Users as UsersIcon, X } from "lucide-react"
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
import { useSearchParams } from "react-router-dom"

export default function Users() {
    const [data, setData] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const { authFetch } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()

    const roleFilter = searchParams.get("role") || ""
    const statusFilter = searchParams.get("status") || ""
    const institutionFilter = searchParams.get("institution") || ""
    const governanceFilter = searchParams.get("governance") || ""

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await authFetch('/api/users')
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
            const res = await authFetch(`/api/users/${user._id}`, {
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
                const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("User deleted successfully")
            } catch (error) {
                console.error("Error deleting user:", error)
                toast.error("Failed to delete user")
            }
        }
    }

    const filteredData = useMemo(() => {
        return data.filter((user) => {
            if (roleFilter && user.role !== roleFilter) return false
            if (statusFilter && user.status !== statusFilter) return false
            if (institutionFilter && user.institution !== institutionFilter) return false

            if (governanceFilter === "orphaned-institutions") {
                return user.role === "Admin" && user.status === "Active"
            }

            if (governanceFilter === "privileged-anomalies") {
                return user.role === "Admin" || user.role === "Manager"
            }

            if (governanceFilter === "password-reset-pending") {
                return user.passwordChangeRequired === true
            }

            return true
        })
    }, [data, roleFilter, statusFilter, institutionFilter, governanceFilter])

    const activeFilters = [
        roleFilter ? `Role: ${roleFilter}` : "",
        statusFilter ? `Status: ${statusFilter}` : "",
        institutionFilter ? `Institution: ${institutionFilter}` : "",
        governanceFilter === "orphaned-institutions" ? "View: Active admins" : "",
        governanceFilter === "privileged-anomalies" ? "View: Privileged users" : "",
        governanceFilter === "password-reset-pending" ? "View: Password reset pending" : "",
    ].filter(Boolean)

    const clearFilters = () => setSearchParams({})

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                   <UsersIcon className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
                   User Management
                </h2>
                <p className="text-muted-foreground">
                    Manage system users, roles, and access levels.
                </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center w-full md:w-auto mt-4 md:mt-0 space-y-2 sm:space-y-0 sm:space-x-2">
                    <Button onClick={() => { setEditingUser(null); setOpen(true); }} className="w-full sm:w-auto bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
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

            {activeFilters.length > 0 && (
                <div className="px-4 sm:px-0">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {activeFilters.map((filter) => (
                                <span key={filter} className="text-xs font-black text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-full">
                                    {filter}
                                </span>
                            ))}
                        </div>
                        <Button variant="ghost" onClick={clearFilters} className="h-9 rounded-xl text-amber-700 hover:text-amber-800 hover:bg-amber-100">
                            <X className="h-4 w-4 mr-2" />
                            Clear Filters
                        </Button>
                    </div>
                </div>
            )}

            <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
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
                        exportTitle="System Users Report"
                        data={filteredData} 
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
