import { useState } from "react"
import { ArrowRight, CheckCircle2, Circle, ListChecks, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export interface PartnerChecklistStep {
  id: string
  title: string
  description: string
  completed: boolean
  actionLabel: string
  onAction: () => void
}

interface PartnerGettingStartedChecklistProps {
  userId: string
  steps: PartnerChecklistStep[]
}

const STORAGE_KEY_PREFIX = "gtvets-partner-getting-started:v1"

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

export function PartnerGettingStartedChecklist({ userId, steps }: PartnerGettingStartedChecklistProps) {
  const [dismissed, setDismissed] = useState(() => (
    window.localStorage.getItem(getStorageKey(userId)) === "dismissed"
  ))
  const completedCount = steps.filter((step) => step.completed).length
  const completionPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0

  const setChecklistDismissed = (nextDismissed: boolean) => {
    setDismissed(nextDismissed)
    if (nextDismissed) {
      window.localStorage.setItem(getStorageKey(userId), "dismissed")
    } else {
      window.localStorage.removeItem(getStorageKey(userId))
    }
  }

  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl bg-white"
          onClick={() => setChecklistDismissed(false)}
        >
          <ListChecks className="mr-2 h-4 w-4 text-amber-600" />
          Show setup checklist
        </Button>
      </div>
    )
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white shadow-lg">
      <CardContent className="p-5 md:p-6">
        <section aria-labelledby="partner-getting-started-title">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-gray-900">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <h3 id="partner-getting-started-title" className="text-lg font-black text-gray-900">Getting Started</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {completedCount === steps.length
                    ? "Setup complete. Your partner workspace is ready to use."
                    : "Finish these core tasks to keep placements moving."}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl text-gray-500"
              aria-label="Hide setup checklist"
              onClick={() => setChecklistDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-amber-100"
              role="progressbar"
              aria-label="Partner setup progress"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={completedCount}
            >
              <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${completionPercentage}%` }} />
            </div>
            <span className="text-sm font-bold text-gray-700">{completedCount} of {steps.length}</span>
          </div>

          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {steps.map((step) => (
              <li key={step.id} className={`rounded-xl border p-4 ${step.completed ? "border-emerald-100 bg-emerald-50/70" : "border-gray-200 bg-white"}`}>
                <div className="flex items-start gap-3">
                  {step.completed
                    ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" aria-hidden="true" />}
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${step.completed ? "text-emerald-800" : "text-gray-900"}`}>{step.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{step.description}</p>
                    {step.completed ? (
                      <span className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-emerald-700">Complete</span>
                    ) : (
                      <Button type="button" variant="link" className="mt-2 min-h-11 h-auto p-0 font-bold text-gray-900" onClick={step.onAction}>
                        {step.actionLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
