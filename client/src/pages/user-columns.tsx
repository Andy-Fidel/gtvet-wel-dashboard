
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type User = {
    _id: string
    name: string
    email: string
    role: 'SuperAdmin' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner'
    status: 'Active' | 'Inactive'
    passwordChangeRequired?: boolean
    phone?: string
    institution?: string
    region?: string
    partnerId?: { _id: string, name: string }
    createdAt: string
}

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "institution",
    header: "Scope (Inst / Region)",
    cell: ({ row }) => {
        const inst = row.original.institution
        const role = row.original.role
        const region = row.original.region
        const partner = row.original.partnerId
        
        if (role === 'RegionalAdmin') return `Region: ${region || 'N/A'}`
        if (role === 'IndustryPartner') return `Partner: ${partner?.name || 'N/A'}`
        return inst || "N/A"
    }
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
        const role = row.getValue("role") as string
        let color = "bg-slate-500 hover:bg-slate-600"
        if (role === 'Admin') color = "bg-purple-500 hover:bg-purple-600"
        if (role === 'Manager') color = "bg-blue-500 hover:bg-blue-600"
        if (role === 'IndustryPartner') color = "bg-orange-500 hover:bg-orange-600"
        
        return <Badge className={`${color} text-white border-0`}>{role}</Badge>
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as string
        let color = "bg-slate-500 hover:bg-slate-600"
        if (status === 'Active') color = "bg-green-500 hover:bg-green-600"
        if (status === 'Inactive') color = "bg-red-500 hover:bg-red-600"
        
        return <Badge className={`${color} text-white border-0`}>{status}</Badge>
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const user = row.original
      const meta = table.options.meta as { 
        onEdit: (user: User) => void, 
        onDelete: (id: string) => void,
        onToggleStatus: (user: User) => void 
      }
 
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
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user._id)}>
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => meta?.onEdit(user)}>Edit Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onToggleStatus(user)}>
                Mark as {user.status === 'Active' ? 'Inactive' : 'Active'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onDelete(user._id)} className="text-red-600 focus:text-red-600">Delete User</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
