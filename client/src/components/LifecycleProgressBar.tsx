import { Check } from "lucide-react"

export type LifecycleStage = 'Pending' | 'Placed' | 'Monitored' | 'Assessed' | 'Completed'

interface LifecycleProgressBarProps {
  currentStage: LifecycleStage
}

const stages: { id: LifecycleStage, label: string }[] = [
  { id: 'Pending', label: 'Registered' },
  { id: 'Placed', label: 'Placed' },
  { id: 'Monitored', label: 'Monitored' },
  { id: 'Assessed', label: 'Assessed' },
  { id: 'Completed', label: 'Completed' },
]

export function LifecycleProgressBar({ currentStage }: LifecycleProgressBarProps) {
  const currentIndex = stages.findIndex(s => s.id === currentStage)

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-100 rounded-full -z-10"></div>
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500 ease-in-out -z-10"
          style={{ width: `${(currentIndex / (stages.length - 1)) * 100}%` }}
        ></div>

        {stages.map((stage, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isPending = index > currentIndex

          return (
            <div key={stage.id} className="flex flex-col items-center gap-2">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-all duration-300
                  ${isCompleted ? 'bg-emerald-500 border-emerald-100 text-white' : ''}
                  ${isCurrent ? 'bg-white border-emerald-500 text-emerald-600 shadow-lg shadow-emerald-500/20' : ''}
                  ${isPending ? 'bg-white border-gray-100 text-gray-300' : ''}
                `}
              >
                {isCompleted ? <Check className="w-5 h-5 font-bold" /> : <span className="text-sm font-bold">{index + 1}</span>}
              </div>
              <span className={`text-[9px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider text-center mt-1 sm:mt-0
                ${isCompleted ? 'text-emerald-700' : ''}
                ${isCurrent ? 'text-gray-900' : ''}
                ${isPending ? 'text-gray-400' : ''}
              `}>
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
