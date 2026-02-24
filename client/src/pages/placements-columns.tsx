
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

export type Placement = {
    _id: string
    learner: {
        _id: string
        name: string
        trackingId: string
    }
    companyName: string
    trackingId: string // The learner's tracking ID
    location: string
    supervisorName: string
    status: 'Active' | 'Completed' | 'Terminated'
    startDate: string
    endDate: string
}

export const columns: ColumnDef<Placement>[] = [
  {
    id: "name",
    accessorFn: (row) => row.learner?.name,
    header: "Learner",
    cell: ({ row }) => {
        const data = row.original;
        return (
            <div className="flex flex-col">
                <span className="font-bold text-white">{data.learner?.name || "N/A"}</span>
                <span className="text-xs font-mono text-[#FFB800]">{data.learner?.trackingId || "N/A"}</span>
            </div>
        )
    }
  },
  {
      accessorKey: "companyName",
      header: "Company",
  },
  {
    accessorKey: "location",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Location
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
  },
  {
    accessorKey: "supervisorName",
    header: "Supervisor",
  },
  {
      accessorKey: "startDate",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Start Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
      cell: ({ row }) => {
          const date = new Date(row.getValue("startDate"));
          return date.toLocaleDateString();
      }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as string
        let color = "bg-slate-500 hover:bg-slate-600"
        if (status === 'Active') color = "bg-green-500 hover:bg-green-600"
        if (status === 'Terminated') color = "bg-red-500 hover:bg-red-600"
        if (status === 'Completed') color = "bg-blue-500 hover:bg-blue-600"
        
        return <Badge className={`${color} text-white border-0`}>{status}</Badge>
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const placement = row.original
      const meta = table.options.meta as { 
        onEdit: (placement: Placement) => void, 
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
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(placement._id)}>
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(placement)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(placement._id)} className="text-red-600 focus:text-red-600">Delete Placement</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
