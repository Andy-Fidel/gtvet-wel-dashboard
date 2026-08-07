import { CalendarClock, CheckCircle2, Clock3, UserCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export interface PartnerHandoff {
  state: string
  ownerName?: string | null
  awaitingParty?: string | null
  dueAt?: string | null
  lastActivityAt?: string | null
  nextAction: string
}

interface PartnerHandoffStatusProps extends PartnerHandoff {
  compact?: boolean
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const getStateClassName = (state: string) => {
  const normalized = state.toLowerCase()
  if (normalized.includes("overdue") || normalized.includes("returned") || normalized.includes("incident")) {
    return "bg-red-100 text-red-700 border-red-200"
  }
  if (normalized.includes("complete") || normalized.includes("current") || normalized.includes("signed")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200"
  }
  if (normalized.includes("progress") || normalized.includes("support")) {
    return "bg-sky-100 text-sky-700 border-sky-200"
  }
  return "bg-amber-100 text-amber-700 border-amber-200"
}

const formatDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : DATE_TIME_FORMATTER.format(parsed)
}

export function PartnerHandoffStatus({
  state,
  ownerName,
  awaitingParty,
  dueAt,
  lastActivityAt,
  nextAction,
  compact = false,
}: PartnerHandoffStatusProps) {
  const dueLabel = formatDate(dueAt)
  const activityLabel = formatDate(lastActivityAt)

  return (
    <div className={compact ? "space-y-2" : "space-y-3"} aria-label={`Workflow status: ${state}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={getStateClassName(state)}>{state}</Badge>
        {awaitingParty && awaitingParty !== "None" ? (
          <Badge variant="outline" className="bg-white text-gray-600">Awaiting {awaitingParty}</Badge>
        ) : null}
      </div>
      <div className={`grid gap-2 text-xs text-gray-600 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {ownerName ? (
          <span className="flex items-center gap-1.5"><UserCircle2 className="h-3.5 w-3.5" /> Owner: {ownerName}</span>
        ) : null}
        {dueLabel ? (
          <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Due: {dueLabel}</span>
        ) : null}
        {activityLabel ? (
          <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Last activity: {activityLabel}</span>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-sm font-semibold text-gray-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D99B00]" />
        <span>Next: {nextAction}</span>
      </p>
    </div>
  )
}
