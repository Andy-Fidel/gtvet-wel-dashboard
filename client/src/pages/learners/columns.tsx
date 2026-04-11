
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
  lastName: string
  firstName: string
  middleName?: string
  gender?: "Male" | "Female" | "Other"
  dateOfBirth?: string
  phone?: string
  guardianContact?: string
  program: string
  region: string
  year: string
  intakeAcademicYear?: string
  academicStatus?: "Active" | "Graduating" | "Graduated" | "Dropped"
  status: "Pending" | "Placed" | "Completed" | "Dropped"
  readiness?: {
    isReadyForPlacement: boolean
    missingFields: string[]
    missingDocuments: string[]
    documentCount: number
  }
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
    accessorKey: "year",
    header: "Year",
  },
  {
    accessorKey: "academicStatus",
    header: "Academic Status",
    cell: ({ row }) => {
      const status = row.original.academicStatus || "Active"
      const color = status === "Graduated"
        ? "bg-indigo-100 text-indigo-700 border-indigo-200"
        : status === "Graduating"
          ? "bg-sky-100 text-sky-700 border-sky-200"
          : status === "Dropped"
            ? "bg-rose-100 text-rose-700 border-rose-200"
            : "bg-emerald-100 text-emerald-700 border-emerald-200"
      return <Badge className={`${color}`}>{status}</Badge>
    }
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
    id: "readiness",
    header: "Placement Readiness",
    cell: ({ row }) => {
      const readiness = row.original.readiness
      if (!readiness) return <Badge variant="outline">Unknown</Badge>
      if (readiness.isReadyForPlacement) {
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Ready</Badge>
      }
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{readiness.missingFields.length} issue(s)</Badge>
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
          <DropdownMenuContent align="end" className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl p-2 min-w-[160px] shadow-2xl">
            <DropdownMenuLabel className="font-bold text-white/60 uppercase tracking-wider text-xs">Actions</DropdownMenuLabel>
             <DropdownMenuItem asChild className="cursor-pointer rounded-xl focus:bg-white/10 focus:text-white transition-colors">
                <Link to={`/learners/${learner._id}`}>View Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(learner._id)} className="cursor-pointer rounded-xl focus:bg-white/10 focus:text-white transition-colors">
              Copy ID
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => meta?.onEdit(learner)} className="cursor-pointer rounded-xl focus:bg-white/10 focus:text-white transition-colors">Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(learner._id)} className="text-red-400 cursor-pointer rounded-xl focus:bg-red-500/10 focus:text-red-400 transition-colors">Delete Learner</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
