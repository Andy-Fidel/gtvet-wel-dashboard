import { ChevronDown } from "lucide-react"
import { PartnerHandoffStatus, type PartnerHandoff } from "@/components/PartnerHandoffStatus"

type HandoffKey = "attendance" | "agreement" | "evaluation" | "support" | "incident" | "messages"

interface PartnerWorkflowHandoffsProps {
  placementId: string
  handoffs: Record<HandoffKey, PartnerHandoff>
}

const LABELS: Record<HandoffKey, string> = {
  attendance: "Attendance",
  agreement: "Placement Agreement",
  evaluation: "Employer Evaluation",
  support: "Support",
  incident: "Incidents",
  messages: "Messages",
}

const HANDOFF_KEYS = Object.keys(LABELS) as HandoffKey[]

function HandoffGrid({ handoffs }: Pick<PartnerWorkflowHandoffsProps, "handoffs">) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {HANDOFF_KEYS.map((key) => (
        <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="mb-3 text-sm font-black text-gray-900">{LABELS[key]}</p>
          <PartnerHandoffStatus {...handoffs[key]} />
        </div>
      ))}
    </div>
  )
}

export function PartnerWorkflowHandoffs({ placementId, handoffs }: PartnerWorkflowHandoffsProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby={`handoff-heading-${placementId}`}>
      <div className="mb-4">
        <p id={`handoff-heading-${placementId}`} className="text-xs font-black uppercase tracking-wider text-gray-400">Workflow Handoffs</p>
        <p className="mt-1 text-sm text-gray-600">See who owns each step, what it is waiting for, and what happens next.</p>
      </div>

      <details className="group md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-800">
          View all 6 workflow statuses
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3"><HandoffGrid handoffs={handoffs} /></div>
      </details>

      <div className="hidden md:block"><HandoffGrid handoffs={handoffs} /></div>
    </section>
  )
}
