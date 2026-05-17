
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, ArrowUpDown, MessageSquare, HeartPulse, Paperclip, Handshake, Archive, CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface HealthDimension {
  score: number;
  max: number;
  details: string[];
}

export interface HealthScore {
  score: number;
  grade: string;
  dimensions: {
    contactCompleteness: HealthDimension;
    attendanceFreshness: HealthDimension;
    visitCoverage: HealthDimension;
    assessmentCompletion: HealthDimension;
    supportEscalation: HealthDimension;
  };
}

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
    closedAt?: string | null
    closedBy?: string | { _id: string; name: string; role?: string } | null
    closureReason?: string
    closureNote?: string
    startDate: string
    endDate: string
    institution?: string
    partner?: {
      _id: string
      name: string
    } | null
    messageCount?: number
    unreadMessageCount?: number
    lastMessageAt?: string | null
    owner?: {
      _id: string
      name: string
      role: string
    } | null
    operationalReadiness?: {
      isOperational: boolean
      missingFields: string[]
    }
    evidenceCount?: number
    evidenceBreakdown?: {
      placement: number
      learner: number
      support: number
      evaluation: number
    }
    healthScore?: HealthScore
    // Cross-region delegation
    placementRegion?: string
    delegate?: {
      _id: string
      name: string
      role: string
      institution: string
    } | null
    delegateInstitution?: string
    delegatedAt?: string
}

const gradeColors: Record<string, string> = {
  A: 'bg-emerald-500 text-white hover:bg-emerald-600',
  B: 'bg-blue-500 text-white hover:bg-blue-600',
  C: 'bg-amber-500 text-white hover:bg-amber-600',
  D: 'bg-orange-500 text-white hover:bg-orange-600',
  F: 'bg-red-500 text-white hover:bg-red-600',
}

const dimensionLabels: Record<string, string> = {
  contactCompleteness: 'Contact Completeness',
  attendanceFreshness: 'Attendance Freshness',
  visitCoverage: 'Visit Coverage',
  assessmentCompletion: 'Assessment Completion',
  supportEscalation: 'Support / Escalation',
}

const dimensionBarColor: Record<string, string> = {
  contactCompleteness: 'bg-indigo-500',
  attendanceFreshness: 'bg-teal-500',
  visitCoverage: 'bg-violet-500',
  assessmentCompletion: 'bg-emerald-500',
  supportEscalation: 'bg-blue-500',
}

function HealthBadge({ healthScore }: { healthScore: HealthScore }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black text-xs cursor-pointer transition-colors border-0 ${gradeColors[healthScore.grade] || gradeColors.F}`}>
          <HeartPulse className="h-3.5 w-3.5" />
          {healthScore.score}
          <span className="opacity-80 text-[10px]">{healthScore.grade}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl border-white/70 bg-white/95 backdrop-blur-xl shadow-2xl" align="start">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h4 className="font-black text-sm text-gray-900">Placement Health</h4>
            <Badge className={`border-0 ${gradeColors[healthScore.grade]}`}>
              {healthScore.score}/100 ({healthScore.grade})
            </Badge>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {Object.entries(healthScore.dimensions).map(([key, dim]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-gray-700">{dimensionLabels[key] || key}</span>
                <span className="font-black text-gray-900">{dim.score}/{dim.max}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`${dimensionBarColor[key] || 'bg-gray-500'} h-1.5 rounded-full transition-all duration-300`}
                  style={{ width: `${(dim.score / dim.max) * 100}%` }}
                />
              </div>
              {dim.details.length > 0 && (
                <p className="text-[10px] font-medium text-gray-500 mt-0.5">{dim.details[0]}</p>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ClosureSummary({ placement }: { placement: Placement }) {
  if (placement.status === "Active") {
    return <Badge variant="outline">Open</Badge>
  }

  const closedBy = placement.closedBy && typeof placement.closedBy === "object" ? placement.closedBy : null
  const hasDetails = Boolean(placement.closureReason || placement.closureNote || placement.closedAt || closedBy?.name)

  if (!hasDetails) {
    return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Archived</Badge>
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto px-0 font-semibold text-slate-700 hover:text-slate-900">
          <Archive className="mr-2 h-4 w-4" />
          View Summary
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl border-white/70 bg-white/95 backdrop-blur-xl shadow-2xl" align="start">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-black text-sm text-gray-900">Closure Summary</h4>
            <Badge className={placement.status === "Completed" ? "bg-blue-500 text-white border-0" : "bg-red-500 text-white border-0"}>
              {placement.status}
            </Badge>
          </div>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Reason</p>
            <p className="mt-1 text-gray-800">{placement.closureReason || "No closure reason recorded."}</p>
          </div>
          {placement.closureNote ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Note</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-700">{placement.closureNote}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-2">
              <CalendarClock className="h-4 w-4 text-slate-500 mt-0.5" />
              <p className="text-gray-700">
                {placement.closedAt ? new Date(placement.closedAt).toLocaleDateString() : "Closure date not recorded"}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Archive className="h-4 w-4 text-slate-500 mt-0.5" />
              <p className="text-gray-700">
                {closedBy?.name ? `${closedBy.name}${closedBy.role ? ` (${closedBy.role})` : ""}` : "Closure owner not recorded"}
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
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
      accessorKey: "endDate",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            End Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
      cell: ({ row }) => {
          const endDate = new Date(row.getValue("endDate"));
          const isActive = row.original.status === 'Active';
          const isOverdue = isActive && endDate < new Date();
          return (
            <span className={isOverdue ? "text-red-600 font-bold" : ""}>
              {endDate.toLocaleDateString()}
              {isOverdue && <span className="ml-1 text-[10px] font-black uppercase tracking-wider text-red-500">Overdue</span>}
            </span>
          );
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
    id: "closureSummary",
    header: "Closure",
    cell: ({ row }) => <ClosureSummary placement={row.original} />
  },
  {
    id: "healthScore",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Health
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.healthScore?.score ?? 0,
    cell: ({ row }) => {
      const hs = row.original.healthScore;
      if (!hs) return <Badge variant="outline">N/A</Badge>
      return <HealthBadge healthScore={hs} />
    },
    sortingFn: (rowA, rowB) => {
      return (rowA.original.healthScore?.score ?? 0) - (rowB.original.healthScore?.score ?? 0);
    },
  },
  {
    id: "owner",
    header: "Owner",
    cell: ({ row }) => {
      const owner = row.original.owner
      if (!owner) return <Badge variant="outline">Unassigned</Badge>
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">{owner.name}</Badge>
    }
  },
  {
    id: "delegate",
    header: "Delegate",
    cell: ({ row }) => {
      const delegate = row.original.delegate
      if (!delegate) return null
      return (
        <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <Handshake className="h-3.5 w-3.5 text-amber-600" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold text-amber-900">{delegate.name}</span>
            <span className="text-[10px] font-semibold text-amber-700">{delegate.institution}</span>
          </div>
        </div>
      )
    }
  },
  {
    accessorKey: "messageCount",
    header: "Messages",
    cell: ({ row, table }) => {
      const count = row.original.messageCount || 0
      const unread = row.original.unreadMessageCount || 0
      return (
        <Button
          variant="ghost"
          className="h-auto px-0 font-semibold text-indigo-700 hover:text-indigo-900"
          onClick={() => {
            const meta = table.options.meta as { onOpenMessages: (placement: Placement) => void }
            meta?.onOpenMessages(row.original)
          }}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          {count}
          {unread > 0 ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">{unread} new</span> : null}
        </Button>
      )
    }
  },
  {
    id: "operationalReadiness",
    header: "Operational",
    cell: ({ row }) => {
      const readiness = row.original.operationalReadiness
      if (!readiness) return <Badge variant="outline">Unknown</Badge>
      return readiness.isOperational
        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Operational</Badge>
        : <Badge className="bg-amber-100 text-amber-700 border-amber-200">Setup Required</Badge>
    }
  },
  {
    accessorKey: "evidenceCount",
    header: "Evidence",
    cell: ({ row, table }) => {
      const count = row.original.evidenceCount || 0
      const meta = table.options.meta as { onOpenEvidence: (placement: Placement) => void }
      return (
        <Button
          variant="ghost"
          className="h-auto px-0 font-semibold text-violet-700 hover:text-violet-900"
          onClick={() => meta?.onOpenEvidence(row.original)}
        >
          <Paperclip className="mr-2 h-4 w-4" />
          {count}
        </Button>
      )
    }
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const placement = row.original
      const meta = table.options.meta as { 
        onEdit: (placement: Placement) => void, 
        onDelete: (id: string) => void,
        onOpenMessages: (placement: Placement) => void,
        onOpenEvidence: (placement: Placement) => void,
        onAssignDelegate?: (placement: Placement) => void,
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
          <DropdownMenuContent align="end" className="bg-white/80 backdrop-blur-xl border-white/40 shadow-xl">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(placement._id)}>
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onOpenMessages(placement)}>
              Open Messages
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onOpenEvidence(placement)}>
              View Evidence
            </DropdownMenuItem>
            {!isSuperAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta?.onEdit(placement)}>Edit Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onAssignDelegate?.(placement)}>
                  <Handshake className="mr-2 h-4 w-4" /> Assign Delegate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta?.onDelete(placement._id)} className="text-red-600 focus:text-red-600">Delete Placement</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
