import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface CategoryBreakdown {
  placement: number
  assessment: number
  monitoring: number
  documentation: number
}

interface ProgressScoreCardProps {
  overall: number
  categoryBreakdown?: CategoryBreakdown
  atRisk?: boolean
  atRiskReasons?: string[]
  className?: string
}

export function ProgressScoreCard({
  overall,
  categoryBreakdown,
  atRisk = false,
  atRiskReasons = [],
  className = "",
}: ProgressScoreCardProps) {
  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "text-emerald-600"
    if (percentage >= 60) return "text-blue-600"
    if (percentage >= 40) return "text-amber-600"
    return "text-red-600"
  }

  const getCategoryColor = (value: number) => {
    if (value >= 80) return "bg-emerald-500"
    if (value >= 50) return "bg-blue-500"
    if (value >= 25) return "bg-amber-500"
    return "bg-gray-300"
  }

  const circumference = 2 * Math.PI * 45 // r=45
  const progressOffset = circumference - (overall / 100) * circumference

  return (
    <Card className={`bg-white border-none shadow-xl rounded-[2rem] overflow-hidden ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-black text-gray-900 flex items-center justify-between">
          <span>Progress Score</span>
          {atRisk && (
            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-200 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              At Risk
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Circular Progress */}
        <div className="flex items-center justify-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
                className={`${getProgressColor(overall)} transition-all duration-500`}
              />
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-black ${getProgressColor(overall)}`}>
                {overall}%
              </span>
              <div className="flex items-center gap-1 mt-1">
                {overall >= 60 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-xs font-bold text-gray-500">
                  {overall >= 60 ? "On track" : "Needs attention"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        {categoryBreakdown && (
          <div className="space-y-3">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">Breakdown</h4>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Placement</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getCategoryColor(categoryBreakdown.placement)} transition-all duration-300`}
                      style={{ width: `${categoryBreakdown.placement}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-10 text-right">
                    {categoryBreakdown.placement}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Assessments</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getCategoryColor(categoryBreakdown.assessment)} transition-all duration-300`}
                      style={{ width: `${categoryBreakdown.assessment}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-10 text-right">
                    {categoryBreakdown.assessment}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Monitoring</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getCategoryColor(categoryBreakdown.monitoring)} transition-all duration-300`}
                      style={{ width: `${categoryBreakdown.monitoring}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-10 text-right">
                    {categoryBreakdown.monitoring}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Documentation</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getCategoryColor(categoryBreakdown.documentation)} transition-all duration-300`}
                      style={{ width: `${categoryBreakdown.documentation}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-10 text-right">
                    {categoryBreakdown.documentation}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* At Risk Reasons */}
        {atRisk && atRiskReasons.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-2">
            <h4 className="text-xs font-black text-red-600 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Risk Factors
            </h4>
            <ul className="space-y-1">
              {atRiskReasons.map((reason, index) => (
                <li key={index} className="text-xs text-red-700 font-medium flex items-start gap-1.5">
                  <span className="mt-0.5 w-1 h-1 bg-red-500 rounded-full shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
