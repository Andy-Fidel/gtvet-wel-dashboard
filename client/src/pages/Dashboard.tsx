import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Overview } from "@/components/dashboard/Overview"
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget"
import { Users, Briefcase, Clock, ArrowUpRight, Download, Building2, ClipboardList, FileText, TrendingUp, Timer, Plus, FileSpreadsheet } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from "recharts"
import { useQuery } from '@tanstack/react-query'

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
  totalVisits: number;
  monthlyStats: { name: string; total: number }[];
  recentPlacements: SimpleLearner[];
}
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton"
import { useEffect } from "react";

export default function Dashboard() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
     if (user?.role === 'IndustryPartner') {
         navigate('/partner-dashboard', { replace: true });
     }
  }, [user, navigate]);

  const downloadCSV = (dataset: any[], filename: string) => {
    if (!dataset.length) return;
    const headers = Object.keys(dataset[0]).join(",");
    const rows = dataset.map(item => {
      return Object.values(item).map(val => {
        const str = String(val);
        return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const isAdminView = user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin';

  const fetchUrl = isAdminView
    ? '/api/admin/overview'
    : '/api/dashboard/stats';

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats', user?.role],
    queryFn: async () => {
      const res = await authFetch(fetchUrl);
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
      return res.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
    enabled: !!user, // Only run the query if we have a user
  });

  if (error) {
    console.error("Dashboard stats query error:", error);
  }

  if (isLoading) {
    if (isAdminView) {
      return <DashboardSkeleton />;
    }
    return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Loading dashboard data...</div>;
  }

  // If SuperAdmin or RegionalAdmin, render the Analytics view
  if (isAdminView && stats && 'totalInstitutions' in stats) {
    const adminData = stats as DashboardStats & {
      totalInstitutions: number;
      totalUsers: number;
      totalPlacements: number;
      totalVisits: number;
      totalReports: number;
      overallPlacementRate: number;
      placementTrend: { name: string; year: number; month: number; count: number }[];
      regionalStats: {
        region: string;
        institutionCount: number;
        totalLearners: number;
        placementRate: number;
      }[];
      institutionStats: {
        _id: string;
        totalLearners: number;
        placed: number;
        pending: number;
        completed: number;
        dropped: number;
      }[];
      genderDistribution: { gender: string; count: number }[];
      programDistribution: { program: string; count: number }[];
      avgTimeToPlacement: number;
      pendingReports: number;
      reportPipeline: { status: string; count: number }[];
    };
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            {user?.role === 'RegionalAdmin' ? `${user.region} Regional Dashboard` : 'Dashboard Overview'}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-purple-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalInstitutions}</div>
                <p className="text-sm font-bold text-gray-400">Institutions</p>
              </div>
            </CardContent>
          </Card>

          {user?.role === 'RegionalAdmin' ? (
            <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-amber-200 rounded-[2rem] shadow-lg hover:shadow-xl transition-all duration-500 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-white/50 backdrop-blur-sm rounded-2xl inline-block">
                    <FileText className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl md:text-3xl font-black text-amber-900">{adminData.pendingReports || 0}</div>
                  <p className="text-sm font-bold text-amber-700/70">Pending Reports</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalUsers}</div>
                  <p className="text-sm font-bold text-gray-400">Total Users</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-indigo-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalLearners}</div>
                <p className="text-sm font-bold text-gray-400">Total Learners</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-green-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <Briefcase className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalPlacements}</div>
                <p className="text-sm font-bold text-gray-400">Total Placements</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Second row: Monitoring Visits, Reports, Overall Placement Rate */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-amber-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <ClipboardList className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalVisits || 0}</div>
                <p className="text-sm font-bold text-gray-400">{user?.role === 'RegionalAdmin' ? 'Visits in your region' : 'Monitoring Visits'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-indigo-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <FileText className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl md:text-3xl font-black text-gray-900">{adminData.totalReports || 0}</div>
                <p className="text-sm font-bold text-gray-400">Semester Reports</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
            <CardContent className="p-4 md:p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-sky-100/50 backdrop-blur-sm rounded-2xl inline-block">
                  <TrendingUp className="h-6 w-6 text-sky-600" />
                </div>
              </div>
              <div className="space-y-1">
                <div className={`text-2xl md:text-3xl font-black ${(adminData.overallPlacementRate || 0) > 70 ? 'text-green-600' : (adminData.overallPlacementRate || 0) > 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {adminData.overallPlacementRate || 0}%
                </div>
                <p className="text-sm font-bold text-gray-400">{user?.role === 'RegionalAdmin' ? 'Regional placement rate' : 'National placement rate'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report Approval Pipeline — RegionalAdmin only */}
        {user?.role === 'RegionalAdmin' && adminData.reportPipeline && (
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-0">
              <CardTitle className="text-2xl font-black">Report Approval Pipeline</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Status of semester reports across your region
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {(['Generated', 'Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected'] as const).map((status) => {
                  const entry = adminData.reportPipeline.find((r) => r.status === status);
                  const count = entry?.count || 0;
                  const colorMap: Record<string, string> = {
                    Generated: 'bg-gray-100 text-gray-700 border-gray-200',
                    Submitted: 'bg-amber-50 text-amber-700 border-amber-200',
                    Regional_Approved: 'bg-blue-50 text-blue-700 border-blue-200',
                    HQ_Approved: 'bg-green-50 text-green-700 border-green-200',
                    Rejected: 'bg-red-50 text-red-700 border-red-200',
                  };
                  const labelMap: Record<string, string> = {
                    Generated: 'Generated',
                    Submitted: 'Submitted',
                    Regional_Approved: 'Regional OK',
                    HQ_Approved: 'HQ Approved',
                    Rejected: 'Rejected',
                  };
                  return (
                    <div key={status} className={`rounded-2xl border p-4 text-center ${colorMap[status]}`}>
                      <div className="text-2xl md:text-3xl font-black">{count}</div>
                      <p className="text-xs font-bold mt-1 uppercase tracking-wider">{labelMap[status]}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Placement Trend Chart */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-4 md:p-8 pb-0">
            <CardTitle className="text-2xl font-black">Placement Trend</CardTitle>
            <CardDescription className="text-base font-bold text-gray-400 mt-2">
              New placements over the last 12 months
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-8">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={adminData.placementTrend || []}>
                <XAxis
                  dataKey="name"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [value, 'Placements']}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {(adminData.placementTrend || []).map((_: unknown, index: number) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#8b5cf6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gender Distribution, Trade Distribution, Avg Time */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Gender Distribution */}
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-0">
              <CardTitle className="text-xl font-black">Gender Distribution</CardTitle>
              <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                Learner gender breakdown
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              {adminData.genderDistribution && adminData.genderDistribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={adminData.genderDistribution}
                        dataKey="count"
                        nameKey="gender"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        strokeWidth={2}
                      >
                        {adminData.genderDistribution.map((_: unknown, index: number) => {
                          const colors = ['#4f46e5', '#ec4899', '#8b5cf6', '#6b7280'];
                          return <Cell key={`g-${index}`} fill={colors[index % colors.length]} />;
                        })}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-4 justify-center">
                    {adminData.genderDistribution.map((g, i: number) => {
                      const colors = ['#4f46e5', '#ec4899', '#8b5cf6', '#6b7280'];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                          <span className="text-sm font-bold text-gray-700">{g.gender}: {g.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-center text-gray-400 py-8">No gender data available</p>
              )}
            </CardContent>
          </Card>

          {/* Trade/Program Distribution */}
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-0">
              <CardTitle className="text-xl font-black">Trade/Program Distribution</CardTitle>
              <CardDescription className="text-sm font-bold text-gray-400 mt-1">
              Learners per program {user?.role === 'RegionalAdmin' ? 'in region' : 'nationally'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              {adminData.programDistribution && adminData.programDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={adminData.programDistribution} layout="vertical">
                    <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="program" stroke="#888" fontSize={11} tickLine={false} axisLine={false} width={120} />
                    <Tooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [value, 'Learners']}
                    />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                      {adminData.programDistribution.map((_: unknown, index: number) => {
                        const colors = ['#FFB800', '#4f46e5', '#10b981', '#ec4899', '#f97316', '#8b5cf6', '#06b6d4'];
                        return <Cell key={`p-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-400 py-8">No program data available</p>
              )}
            </CardContent>
          </Card>

          {/* Avg Time to Placement */}
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col justify-center items-center">
            <CardHeader className="p-4 md:p-8 pb-0 text-center">
              <div className="mx-auto p-4 bg-amber-50 rounded-2xl mb-4">
                <Timer className="h-8 w-8 text-amber-600" />
              </div>
              <CardTitle className="text-xl font-black">Avg. Time to Placement</CardTitle>
              <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                From registration to first placement
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-8 text-center">
              <div className="text-5xl font-black text-amber-600">
                {adminData.avgTimeToPlacement || 0}
              </div>
              <p className="text-base font-bold text-gray-400 mt-2">days</p>
            </CardContent>
          </Card>
        </div>

        {/* Regional / Institutional breakdown */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mt-4">
           {/* Regional Stats */}
           <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden min-h-[500px]">
              <CardHeader className="p-4 md:p-8 pb-0">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-black">Regional Performance</CardTitle>
                    <CardDescription className="text-base font-bold text-gray-400 mt-2">
                      Institution distribution and placement rates by region
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadCSV(adminData.regionalStats || [], 'regional-performance')}
                    className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
                  >
                    <Download className="mr-2 h-4 w-4" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8">
                <div className="space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                  {adminData.regionalStats?.map((reg, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="flex flex-col">
                        <span className="text-lg font-black text-gray-900">{reg.region || 'Unknown'}</span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                          {reg.institutionCount} Institutions • {reg.totalLearners} Learners
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-xl font-black ${reg.placementRate > 70 ? 'text-green-600' : reg.placementRate > 40 ? 'text-amber-600' : 'text-red-600'}`}>
                          {Math.round(reg.placementRate)}%
                        </span>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Placement Rate</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
           </Card>

           <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden min-h-[500px]">
              <CardHeader className="p-4 md:p-8 pb-0">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-black">Top Institutions</CardTitle>
                    <CardDescription className="text-base font-bold text-gray-400 mt-2">
                      Highest performing centers by placement
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                  {adminData.institutionStats?.map((stat, i: number) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                      <span className="text-lg font-black text-gray-900 truncate pr-4">{stat._id}</span>
                      <div className="flex items-center gap-6 min-w-fit">
                          <div className="text-right">
                              <span className="text-xl font-black text-gray-900 block">{stat.totalLearners}</span>
                              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Total</span>
                          </div>
                          <div className="text-right">
                              <span className="text-xl font-black text-green-600 block">{stat.placed}</span>
                              <span className="text-[10px] uppercase tracking-widest text-green-400 font-bold">Placed</span>
                          </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
           </Card>
        </div>

      {/* Institution Breakdown */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden mt-6">
        <CardHeader className="p-4 md:p-8 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-black">Institution Breakdown</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Learner distribution and placement rates per institution
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => downloadCSV(adminData.institutionStats, 'institutional-breakdown')}
              className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-8">
          {adminData.institutionStats?.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No institution data yet. Users must register and create learners.</p>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
              {adminData.institutionStats?.map((inst) => {
                const placementRate = inst.totalLearners > 0 
                  ? Math.round((inst.placed / inst.totalLearners) * 100) 
                  : 0;

                return (
                  <div key={inst._id} className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#FFB800]/10 rounded-xl">
                          <Building2 className="h-5 w-5 text-[#FFB800]" />
                        </div>
                        <div>
                          <h4 className="font-black text-lg text-gray-900">{inst._id}</h4>
                          <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full inline-block mt-1">
                            {placementRate}% Placement Rate
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="bg-white p-3 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Total</span>
                        <span className="text-lg font-black text-gray-900">{inst.totalLearners}</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Pending</span>
                        <span className="text-lg font-black text-amber-600">{inst.pending}</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Placed</span>
                        <span className="text-lg font-black text-green-600">{inst.placed}</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Completed</span>
                        <span className="text-lg font-black text-indigo-600">{inst.completed}</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Dropped</span>
                        <span className="text-lg font-black text-red-600">{inst.dropped}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    );
  }

  // Regular Institutional Dashboard renders below
  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Personalized Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-gray-100 relative overflow-hidden">
        {/* Background decorative blob */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            Welcome back, {user?.name || 'Administrator'}
          </h2>
          <p className="text-gray-500 font-medium mt-1">
            Here's what's happening at your institution today.
          </p>
          
          <div className="flex items-center gap-3 mt-4">
             <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs items-center inline-flex font-bold border border-amber-100">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 animate-pulse"></div>
                {stats?.pending || 0} Pending Placements
             </div>
             <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs items-center inline-flex font-bold border border-indigo-100">
                <Users className="w-3 h-3 mr-1" />
                {stats?.totalLearners || 0} Total Learners
             </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button onClick={() => navigate('/learners')} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold h-11 px-5">
            <Plus className="mr-2 h-4 w-4" /> Register Learner
          </Button>
          <Button onClick={() => navigate('/semester-reports')} variant="outline" className="rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold h-11 px-5 bg-white shadow-sm">
            <FileSpreadsheet className="mr-2 h-4 w-4 text-indigo-500" /> Submit Report
          </Button>
        </div>
      </div>

      {stats?.totalLearners === 0 ? (
        <Card className="bg-white border-dashed border-2 border-indigo-100 rounded-[2.5rem] shadow-sm flex flex-col items-center justify-center p-8 md:p-16 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-200 transform rotate-3">
               <Users className="w-10 h-10 text-white transform -rotate-3" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">Welcome to your Workspace!</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">Your institution's dashboard is currently empty. Start by registering your first VTET learner to unlock analytics, placement tracking, and more.</p>
            <Button onClick={() => navigate('/learners')} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl shadow-indigo-600/20 font-black h-12 px-8 text-base">
                <Plus className="mr-2 h-5 w-5" /> Register First Learner
            </Button>
        </Card>
      ) : (
        <>
          {/* Enhanced Stat Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-indigo-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <Users className="h-6 w-6 text-indigo-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900">{stats?.totalLearners || 0}</h3>
                  <p className="text-sm font-bold text-gray-400">Total Registered Learners</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-emerald-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <Briefcase className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black">
                     {stats?.totalLearners ? Math.round((stats.placed / stats.totalLearners) * 100) : 0}% Rate
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900">{stats?.placed || 0}</h3>
                  <p className="text-sm font-bold text-gray-400">Successfully Placed</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-amber-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <Clock className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900">{stats?.pending || 0}</h3>
                  <p className="text-sm font-bold text-gray-400">Pending Placements</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <ClipboardList className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900">{stats?.totalVisits || 0}</h3>
                  <p className="text-sm font-bold text-gray-400">Total Monitoring Visits</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bento Box Grid */}
          <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
            
            {/* Action Required Widget */}
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col max-h-[500px] xl:col-span-1 border-t-4 border-t-amber-400">
              <CardHeader className="p-4 md:p-6 pb-2">
                <CardTitle className="text-xl font-black flex items-center gap-2">
                   Action Required
                </CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400">
                  Tasks needing immediate attention.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-2 flex-1 overflow-y-auto custom-scrollbar">
                <ActionRequiredWidget />
              </CardContent>
            </Card>

            {/* Overview Chart */}
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden min-h-[400px] xl:col-span-2">
              <CardHeader className="p-6 md:p-8 pb-0">
                <CardTitle className="text-xl md:text-2xl font-black border-l-4 border-indigo-500 pl-4">Placement Trends</CardTitle>
                <CardDescription className="text-sm md:text-base font-bold text-gray-400 mt-2 pl-4">
                  Monthly placements over the current academic year.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-8 pt-4">
                <Overview />
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row - Recent Activity */}
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-6 md:p-8 pb-4 border-b border-gray-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">Recent Activity</CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                  Latest lifecycle events for your learners.
                </CardDescription>
              </div>
              <Button variant="ghost" className="text-indigo-600 hover:text-indigo-700 font-bold" onClick={() => navigate('/learners')}>
                View all learners →
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
                {stats?.recentPlacements.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 font-medium">No recent activity found.</div>
                ) : (
                  stats?.recentPlacements.map((learner, index) => {
                    const colors = [
                      'bg-indigo-100 text-indigo-700',
                      'bg-emerald-100 text-emerald-700',
                      'bg-amber-100 text-amber-700',
                      'bg-pink-100 text-pink-700',
                      'bg-cyan-100 text-cyan-700'
                    ];
                    const colorClass = colors[index % colors.length];

                    return (
                      <div key={learner._id} className="flex items-center group cursor-pointer hover:bg-gray-50/80 p-4 md:p-6 transition-all duration-300">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-black shadow-inner border border-white/50 ${colorClass}`}>
                          {learner.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                        </div>
                        <div className="ml-5 flex-1 space-y-1">
                          <p className="text-base font-black leading-none text-gray-900 group-hover:text-indigo-600 transition-colors">{learner.name}</p>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <span>{learner.program}</span>
                            {learner.placement?.location && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                <span>{learner.placement.location}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="ml-auto text-right">
                          <div className={`inline-flex px-3 py-1 rounded-full font-black text-[10px] uppercase tracking-widest ${
                            learner.status === 'Placed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            learner.status === 'Completed' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                            learner.status === 'Dropped' ? 'bg-red-50 text-red-600 border border-red-100' : 
                            'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}>
                            {learner.status}
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 mt-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            View Profile <ArrowUpRight className="w-3 h-3" />
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
