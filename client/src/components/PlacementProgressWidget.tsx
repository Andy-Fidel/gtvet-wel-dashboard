
import { useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
import { Briefcase, TrendingUp } from "lucide-react"

interface DashboardStats {
  totalLearners: number;
  placed: number;
  pending: number;
}

export function PlacementProgressWidget() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'SuperAdmin') return;

    authFetch('http://localhost:5001/api/dashboard/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching widget stats:", err);
        setLoading(false);
      });
  }, [authFetch, user?.role]);

  if (user?.role === 'SuperAdmin' || loading || !stats) return null;

  const percentage = stats.totalLearners > 0 
    ? Math.round((stats.placed / stats.totalLearners) * 100) 
    : 0;

  return (
    <div className="bg-[#FFB800]/10 rounded-3xl p-6 relative overflow-hidden group border border-[#FFB800]/20">
      <div className="flex items-center justify-between mb-4">
        <div className="h-10 w-10 rounded-2xl bg-[#FFB800] flex items-center justify-center text-gray-900 shadow-lg shadow-[#FFB800]/20">
          <Briefcase className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1 text-[#FFB800]">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-black">{percentage}%</span>
        </div>
      </div>
      
      <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Placement Progress</p>
      <h3 className="text-sm font-black text-gray-900 mb-4 tracking-tight leading-tight">
        {stats.placed} of {stats.totalLearners} Learners Placed
      </h3>

      {/* Progress Bar */}
      <div className="h-2 w-full bg-[#FFB800]/10 rounded-full mb-4 overflow-hidden">
        <div 
          className="h-full bg-[#FFB800] rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,184,0,0.5)]"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <button 
        onClick={() => navigate('/placements')}
        className="w-full bg-[#FFB800] text-gray-900 font-bold py-3 rounded-2xl text-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      >
        View Placements
      </button>

      {/* Decorative background shape */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#FFB800]/5 rounded-full blur-2xl group-hover:bg-[#FFB800]/10 transition-colors" />
    </div>
  )
}
