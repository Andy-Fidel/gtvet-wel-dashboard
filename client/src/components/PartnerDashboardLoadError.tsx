import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface PartnerDashboardLoadErrorProps {
  message: string
  hasCachedData: boolean
  onRetry: () => void
}

export function PartnerDashboardLoadError({ message, hasCachedData, onRetry }: PartnerDashboardLoadErrorProps) {
  return (
    <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm" role="alert" aria-labelledby="partner-dashboard-load-error-title">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 id="partner-dashboard-load-error-title" className="font-black text-gray-900">
              {hasCachedData ? "Could not refresh the dashboard" : "Could not load the dashboard"}
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {hasCachedData ? "Your last loaded information is still shown below. " : "No dashboard totals are being shown as current. "}
              {message}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="min-h-11 shrink-0 rounded-xl border-red-200 bg-white" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
