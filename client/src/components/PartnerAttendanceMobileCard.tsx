import { CheckCircle2, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PartnerHandoffStatus } from "@/components/PartnerHandoffStatus"

interface PartnerAttendanceMobileCardProps {
  log: {
    entryType: "Daily" | "Weekly"
    periodStart: string
    periodEnd: string
    startTime?: string
    endTime?: string
    hoursWorked: number
    status: "Pending" | "SignedOff" | "Rejected"
    submittedSource: "Institution" | "Partner"
    supervisorComment?: string
    createdAt?: string
    updatedAt?: string
    signedOffAt?: string | null
    learner: { name: string; trackingId: string }
    placement: { companyName: string; supervisorName?: string }
  }
  canEdit: boolean
  canSignOff: boolean
  onEdit: () => void
  onDelete: () => void
  onSignOff: () => void
  onReject: () => void
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

const formatDate = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Not available" : DATE_FORMATTER.format(parsed)
}

const statusClassName = (status: PartnerAttendanceMobileCardProps["log"]["status"]) => {
  if (status === "SignedOff") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "Rejected") return "bg-red-100 text-red-700 border-red-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

export function PartnerAttendanceMobileCard({
  log,
  canEdit,
  canSignOff,
  onEdit,
  onDelete,
  onSignOff,
  onReject,
}: PartnerAttendanceMobileCardProps) {
  const state = log.status === "SignedOff" ? "Completed" : log.status === "Rejected" ? "Awaiting Institution" : "Awaiting Partner"
  const awaitingParty = log.status === "SignedOff" ? "None" : log.status === "Rejected" ? "Institution" : "Partner"

  return (
    <article className="space-y-4 border-b border-gray-100 p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-black text-gray-900">{log.learner.name}</h4>
          <p className="mt-1 font-mono text-xs text-gray-500">{log.learner.trackingId}</p>
          <p className="mt-1 truncate text-sm text-gray-600">{log.placement.companyName}</p>
        </div>
        <Badge className={statusClassName(log.status)}>{log.status === "SignedOff" ? "Signed Off" : log.status}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">Period</dt>
          <dd className="mt-1 font-semibold text-gray-800">
            {formatDate(log.periodStart)}{log.entryType === "Weekly" ? ` – ${formatDate(log.periodEnd)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">Hours</dt>
          <dd className="mt-1 text-xl font-black text-gray-900">{log.hoursWorked}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">Time</dt>
          <dd className="mt-1 font-semibold text-gray-800">{log.startTime || "--:--"} – {log.endTime || "--:--"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">Entry</dt>
          <dd className="mt-1 font-semibold text-gray-800">{log.entryType} · {log.submittedSource}</dd>
        </div>
      </dl>

      <PartnerHandoffStatus
        compact
        state={state}
        ownerName={log.status === "Rejected" ? "Institution" : log.placement.supervisorName || "Partner supervisor"}
        awaitingParty={awaitingParty}
        lastActivityAt={log.updatedAt || log.signedOffAt || log.createdAt || log.periodEnd}
        nextAction={log.status === "SignedOff" ? "No action required." : log.status === "Rejected" ? "Institution must correct and resubmit this entry." : "Review and sign off or return this entry."}
      />

      {log.supervisorComment ? <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{log.supervisorComment}</p> : null}

      {canEdit || canSignOff ? (
        <div className="grid grid-cols-2 gap-2">
          {canEdit ? (
            <>
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
              <Button variant="outline" className="min-h-11 rounded-xl border-red-200 text-red-700" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            </>
          ) : null}
          {canSignOff ? (
            <>
              <Button className="min-h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={onSignOff}><CheckCircle2 className="mr-2 h-4 w-4" />Sign Off</Button>
              <Button variant="outline" className="min-h-11 rounded-xl border-red-200 text-red-700" onClick={onReject}>Return</Button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
