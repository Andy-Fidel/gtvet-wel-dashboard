
import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

export type Learner = {
  _id: string
  trackingId: string
  indexNumber: string
  name: string
  program: string
  region: string
  status: "Pending" | "Placed" | "Completed" | "Dropped"
  email: string
}

export const columns: ColumnDef<Learner>[] = [
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
    accessorKey: "trackingId",
    header: "Tracking ID",
    cell: ({ row }) => <span className="font-mono font-bold text-[#FFB800]">{row.getValue("trackingId")}</span>
  },
  {
    accessorKey: "indexNumber",
    header: "Index Number",
  },
  {
    accessorKey: "program",
    header: "Program",
  },
  {
      accessorKey: "region",
      header: "Region",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as string
        let color = "bg-slate-500"
        if (status === 'Placed' || status === 'Completed') color = "bg-green-500 hover:bg-green-600"
        if (status === 'Pending') color = "bg-amber-500 hover:bg-amber-600"
        if (status === 'Dropped') color = "bg-red-500 hover:bg-red-600"
        
        return <Badge className={`${color} text-white`}>{status}</Badge>
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const learner = row.original
      const meta = table.options.meta as { 
        onEdit: (learner: Learner) => void, 
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
             <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={`/learners/${learner._id}`}>View Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(learner._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(learner)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(learner._id)} className="text-red-600">Delete Learner</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
