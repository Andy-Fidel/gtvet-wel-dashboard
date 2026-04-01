import { Clock, Calendar, AlertCircle, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface PlacementProgress {
  startDate: string
  endDate?: string
  elapsedDays: number
  totalDays: number
  remainingDays: number
  percent: number
}

interface PlacementDurationTrackerProps {
  placementProgress?: PlacementProgress | null
  companyName?: string
  className?: string
}

export function PlacementDurationTracker({
  placementProgress,
  companyName,
  className = "",
}: PlacementDurationTrackerProps) {
  if (!placementProgress) {
    return (
      <Card className={`bg-white border-none shadow-xl rounded-[2rem] overflow-hidden ${className}`}>
        <CardContent className="p-8 text-center">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No active placement</p>
        </CardContent>
      </Card>
    )
  }

  const { startDate, endDate, elapsedDays, totalDays, remainingDays, percent } = placementProgress

  const getStatusColor = () => {
    if (percent >= 80) return "bg-emerald-500 text-emerald-700"
    if (percent >= 50) return "bg-blue-500 text-blue-700"
    if (percent >= 25) return "bg-amber-500 text-amber-700"
    return "bg-red-500 text-red-700"
  }

  const getProgressBarColor = () => {
    if (percent >= 80) return "bg-emerald-500"
    if (percent >= 50) return "bg-blue-500"
    if (percent >= 25) return "bg-amber-500"
    return "bg-red-500"
  }

  const isNearingEnd = remainingDays <= 14 && remainingDays > 0
  const isCompleted = percent >= 100

  return (
    <Card className={`bg-white border-none shadow-xl rounded-[2rem] overflow-hidden ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-500" />
            Placement Duration
          </CardTitle>
          <Badge className={`${getStatusColor()} border-0`}>
            {isCompleted ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completed
              </>
            ) : isNearingEnd ? (
              <>
                <AlertCircle className="h-3 w-3 mr-1" />
                {remainingDays} days left
              </>
            ) : (
              "In Progress"
            )}
          </Badge>
        </div>
        {companyName && (
          <p className="text-sm font-medium text-gray-500 mt-1">{companyName}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-gray-500">Progress</span>
            <span className="text-gray-900 font-bold">{percent}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressBarColor()} transition-all duration-500 rounded-full`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Started</p>
            <p className="text-sm font-black text-gray-900 mt-1">
              {format(new Date(startDate), "MMM d")}
            </p>
            <p className="text-[10px] font-medium text-gray-500">
              {format(new Date(startDate), "yyyy")}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Elapsed</p>
            <p className="text-sm font-black text-gray-900 mt-1">{elapsedDays}d</p>
            <p className="text-[10px] font-medium text-gray-500">
              of {totalDays}d planned
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {isCompleted ? "Completed" : "Remaining"}
            </p>
            <p className="text-sm font-black text-gray-900 mt-1">
              {isCompleted ? elapsedDays : remainingDays}d
            </p>
            <p className="text-[10px] font-medium text-gray-500">
              {endDate
                ? format(new Date(endDate), "MMM d")
                : isCompleted
                ? "Today"
                : "Expected"}
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-center">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mx-auto" />
            <p className="text-[10px] font-medium text-gray-500 mt-2">
              {format(new Date(startDate), "MMM d, yyyy")}
            </p>
            <p className="text-[9px] font-bold text-gray-400 uppercase">Start Date</p>
          </div>

          {endDate && (
            <>
              <div className="flex-1 mx-4">
                <div className="h-0.5 bg-gradient-to-r from-indigo-200 via-indigo-400 to-indigo-200" />
              </div>
              <div className="text-center">
                <div className="w-2 h-2 bg-indigo-500 rounded-full mx-auto" />
                <p className="text-[10px] font-medium text-gray-500 mt-2">
                  {format(new Date(endDate), "MMM d, yyyy")}
                </p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">End Date</p>
              </div>
            </>
          )}
        </div>

        {/* Warning for nearing end */}
        {isNearingEnd && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700">Placement ending soon</p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                {remainingDays} days remaining. Ensure final assessments and evaluations are completed.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
