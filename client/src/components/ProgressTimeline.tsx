import type { ReactNode } from "react"
import { Check, Clock, MapPin, Award, Briefcase, FileText, Star, GraduationCap, User } from "lucide-react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"

export interface Milestone {
  key: string
  label: string
  completedAt?: string
  details?: Record<string, unknown>
}

interface ProgressTimelineProps {
  completedMilestones: Milestone[]
  pendingMilestones: Milestone[]
}

const milestoneIcons: Record<string, ReactNode> = {
  registered: <User className="h-4 w-4" />,
  placed: <MapPin className="h-4 w-4" />,
  firstVisit: <FileText className="h-4 w-4" />,
  firstAssessment: <Award className="h-4 w-4" />,
  employerEval: <Briefcase className="h-4 w-4" />,
  midpoint: <Clock className="h-4 w-4" />,
  finalAssessment: <GraduationCap className="h-4 w-4" />,
  completed: <Star className="h-4 w-4" />,
}

const milestoneColors: Record<string, string> = {
  registered: "bg-blue-500",
  placed: "bg-indigo-500",
  firstVisit: "bg-blue-500",
  firstAssessment: "bg-emerald-500",
  employerEval: "bg-purple-500",
  midpoint: "bg-amber-500",
  finalAssessment: "bg-emerald-500",
  completed: "bg-[#FFB800]",
}

export function ProgressTimeline({ completedMilestones, pendingMilestones }: ProgressTimelineProps) {
  const allMilestones = [...completedMilestones, ...pendingMilestones]

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />

      <div className="space-y-6">
        {allMilestones.map((milestone) => {
          const isCompleted = milestone.completedAt !== undefined
          const icon = milestoneIcons[milestone.key] || <Clock className="h-4 w-4" />
          const color = milestoneColors[milestone.key] || "bg-gray-400"
          const details = milestone.details

          return (
            <div key={milestone.key} className="relative flex items-start gap-4">
              {/* Icon circle */}
              <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isCompleted ? color : "bg-gray-100 border-2 border-gray-200"
              }`}>
                <div className={isCompleted ? "text-white" : "text-gray-400"}>
                  {isCompleted ? <Check className="h-5 h-5 font-bold" /> : icon}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pt-1 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`font-bold text-sm ${isCompleted ? "text-gray-900" : "text-gray-400"}`}>
                    {milestone.label}
                  </h4>
                  {isCompleted && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                      Completed
                    </Badge>
                  )}
                  {!isCompleted && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-400 border-gray-200 text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>

                {isCompleted && milestone.completedAt && (
                  <p className="text-xs text-gray-500 font-medium">
                    {format(new Date(milestone.completedAt), "MMM d, yyyy")}
                  </p>
                )}

                {/* Details */}
                {details && Object.keys(details).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {typeof details.companyName === "string" && details.companyName && (
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">
                        {details.companyName}
                      </Badge>
                    )}
                    {typeof details.sector === "string" && details.sector && (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">
                        {details.sector}
                      </Badge>
                    )}
                    {typeof details.overallScore === "number" && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] flex items-center gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {details.overallScore}/5
                      </Badge>
                    )}
                    {typeof details.performanceRating === "number" && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        Rating: {details.performanceRating}/5
                      </Badge>
                    )}
                    {typeof details.visitType === "string" && details.visitType && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        {details.visitType} Visit
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
