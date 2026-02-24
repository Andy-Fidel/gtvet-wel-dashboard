import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Overview } from "@/components/dashboard/Overview"
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget"
import { Users, Briefcase, Clock, ArrowUpRight } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"

interface SimpleLearner {
  _id: string;
  name: string;
  program: string;
  status: string;
  region: string;
  placement?: {
    location: string;
  };
}

interface DashboardStats {
  totalLearners: number;
  placed: number;
  pending: number;
  monthlyStats: { name: string; total: number }[];
  recentPlacements: SimpleLearner[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'SuperAdmin') {
      navigate('/system-overview');
      return;
    }

    authFetch('http://localhost:5001/api/dashboard/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching stats:", err);
        setLoading(false);
      });
  }, [authFetch, navigate, user?.role]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading dashboard data...</div>;
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Learners
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLearners}</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Placed Learners
            </CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.placed}</div>
            <p className="text-xs text-muted-foreground">
              68% placement rate
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Placements</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.pending}</div>
            <p className="text-xs text-muted-foreground">
              Due for placement soon
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Supervisors
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">142</div>
            <p className="text-xs text-muted-foreground">
              +12 since last week
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4 bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden min-h-[500px]">
          <CardHeader className="p-4 md:p-8 pb-0">
            <CardTitle className="text-xl md:text-2xl font-black">Overview</CardTitle>
            <CardDescription className="text-sm md:text-base font-bold text-gray-400 mt-2">
              Monthly placement trends for the current academic year.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-8 pt-4">
            <Overview />
          </CardContent>
        </Card>
        
        <div className="col-span-1 lg:col-span-3 space-y-4">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col max-h-[400px]">
            <CardHeader className="p-4 md:p-6 pb-2">
              <CardTitle className="text-xl font-black">Action Required</CardTitle>
              <CardDescription className="text-sm font-bold text-gray-400">
                Tasks needing your immediate attention.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-2 flex-1 overflow-y-auto custom-scrollbar">
              <ActionRequiredWidget />
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col">
            <CardHeader className="p-4 md:p-6 pb-2">
              <CardTitle className="text-xl font-black">Recent Placements</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-2 flex-1">
              <div className="space-y-6">
                {stats?.recentPlacements.map((learner, index) => (
                  <div key={learner._id} className="flex items-center group cursor-pointer hover:bg-gray-50 p-2 -mx-2 rounded-2xl transition-all duration-300">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm
                      ${index % 2 === 0 ? 'bg-[#FFB800]/10 text-[#FFB800]' : 'bg-[#4ADE80]/10 text-[#4ADE80]'}`}>
                      {learner.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div className="ml-4 space-y-1 block max-w-[120px]">
                      <p className="text-sm font-black leading-none text-gray-900 truncate">{learner.name}</p>
                      <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider truncate">
                        {learner.program}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <div className={`font-black text-xs uppercase tracking-widest ${learner.status === 'Placed' ? 'text-[#4ADE80]' : 'text-[#FFB800]'}`}>
                        {learner.status}
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 mt-1">{learner.placement?.location || learner.region}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
