import { useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
import { AlertCircle, User, Activity, Clock, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

interface ActionAlert {
  type: 'Needs Placement' | 'Needs Visit' | 'Needs Assessment';
  learnerId: string;
  learnerName: string;
  trackingId: string;
  message: string;
  actionUrl: string;
}

export function ActionRequiredWidget() {
  const [alerts, setAlerts] = useState<ActionAlert[]>([])
  const [loading, setLoading] = useState(true)
  const { authFetch } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await authFetch('/api/dashboard/action-alerts')
        if (res.ok) {
          const data = await res.json()
          setAlerts(data)
        }
      } catch (error) {
        console.error("Failed to fetch action alerts", error)
      } finally {
        setLoading(false)
      }
    }
    fetchAlerts()
  }, [authFetch])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[1.5rem]" />
        ))}
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50/50 rounded-[1.5rem] border border-dashed border-gray-200 h-full min-h-[250px]">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm transform -rotate-3">
          <Activity className="w-8 h-8 transform rotate-3" />
        </div>
        <h4 className="text-lg font-black text-gray-900">All Caught Up!</h4>
        <p className="text-sm font-medium text-gray-500 mt-1 max-w-[200px]">No pending actions required at the moment.</p>
      </div>
    )
  }

  const getIconForType = (type: string) => {
    switch (type) {
      case 'Needs Placement': return <User className="w-5 h-5 text-indigo-500" />;
      case 'Needs Visit': return <Clock className="w-5 h-5 text-amber-500" />;
      case 'Needs Assessment': return <AlertCircle className="w-5 h-5 text-pink-500" />;
      default: return <Activity className="w-5 h-5 text-blue-500" />;
    }
  }

  const getBgForType = (type: string) => {
    switch (type) {
      case 'Needs Placement': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Needs Visit': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Needs Assessment': return 'bg-pink-50 text-pink-700 border-pink-100';
      default: return 'bg-blue-50 text-blue-700 border-blue-100';
    }
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert, index) => {
        // More urgent actions get a pulsing dot
        const isUrgent = alert.type === 'Needs Assessment' || alert.type === 'Needs Visit';

        return (
          <div 
            key={`${alert.learnerId}-${index}`}
            onClick={() => navigate(`/learners/${alert.learnerId}`)}
            className={`group flex items-start gap-4 p-4 rounded-[1.5rem] border cursor-pointer hover:shadow-lg transition-all duration-300 relative overflow-hidden ${getBgForType(alert.type)}`}
          >
            {isUrgent && (
               <div className="absolute top-4 right-4 flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
               </div>
            )}
            
            <div className="p-3 bg-white/60 backdrop-blur-sm rounded-xl shrink-0 shadow-sm group-hover:bg-white transition-colors">
              {getIconForType(alert.type)}
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{alert.type}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-white/60 rounded-full">{alert.trackingId}</span>
              </div>
              <h4 className="font-black text-base truncate text-gray-900">{alert.learnerName}</h4>
              <p className="text-xs font-bold opacity-75 mt-0.5 line-clamp-1">{alert.message}</p>
            </div>
            <div className="shrink-0 flex items-center justify-center auto rounded-full bg-white/0 group-hover:bg-white/50 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 self-center">
              <ChevronRight className="w-5 h-5 opacity-70" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
