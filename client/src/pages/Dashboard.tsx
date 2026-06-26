import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Overview } from "@/components/dashboard/Overview"
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget"
import { Users, Briefcase, Clock, ArrowUpRight, ClipboardList, FileText, TrendingUp, Timer, Plus, FileSpreadsheet, GraduationCap, Handshake, AlertTriangle } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useQuery } from '@tanstack/react-query'
import { toast } from "sonner"
import type { AdminOverviewStats, DashboardStats } from "@/types/dashboard"
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton"
import { AdminDashboardView } from "./AdminDashboardView"
import { useEffect } from "react";
export default function Dashboard() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  const openLearnerRegister = (params?: Record<string, string>) => {
    const query = new URLSearchParams(params || {}).toString();
    navigate(query ? `/learners?${query}` : '/learners');
  };

  const openInterventionQueue = (params?: Record<string, string>) => {
    const query = new URLSearchParams(params || {}).toString();
    navigate(query ? `/learner-progress?${query}` : '/learner-progress');
  };

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

  const { data: stats, isLoading, error, isError, refetch, isFetching } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats', user?._id, user?.role],
    queryFn: async () => {
      const res = await authFetch(fetchUrl);
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || 'Failed to fetch dashboard stats');
      }
      return res.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
    enabled: !!user, // Only run the query if we have a user
  });

  // Fetch delegated placements for institution-level users
  const { data: delegatedPlacements } = useQuery<any[]>({
    queryKey: ['delegatedPlacements', user?._id],
    queryFn: async () => {
      const res = await authFetch('/api/placements/delegated-to-me');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user && !isAdminView,
  });

  if (error) {
    console.error("Dashboard stats query error:", error);
  }

  useEffect(() => {
    if (!isError) return;
    toast.error(error instanceof Error ? error.message : "Failed to load dashboard data");
  }, [error, isError]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError && !stats) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard data";
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <Card className="w-full max-w-lg rounded-[2rem] border-red-100 bg-white shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <AlertTriangle className="h-7 w-7 text-red-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900">Dashboard failed to load</h2>
            <p className="mt-2 text-sm font-medium text-gray-500">{message}</p>
            <Button className="mt-6 rounded-xl" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If SuperAdmin or RegionalAdmin, render the Analytics view
  if (isAdminView && stats && 'totalInstitutions' in stats) {
    return (
      <AdminDashboardView
        adminData={stats as AdminOverviewStats}
        user={user ?? null}
        downloadCSV={downloadCSV}
        openLearnerRegister={openLearnerRegister}
        openInterventionQueue={openInterventionQueue}
      />
    );
  }

  // Regular Institutional Dashboard renders below
  const institutionPerformance = stats?.institutionPerformance;
  const placementTrendData = stats?.monthlyStats || [];
  
  // Compute gender distribution metrics
  const maleCount = stats?.genderDistribution?.find((g) => g.gender === "Male")?.count || 0;
  const femaleCount = stats?.genderDistribution?.find((g) => g.gender === "Female")?.count || 0;
  const otherCount = stats?.genderDistribution?.find((g) => g.gender === "Other")?.count || 0;
  const unspecifiedCount = stats?.genderDistribution?.find((g) => g.gender === "Unspecified")?.count || 0;
  const totalGenderCount = maleCount + femaleCount + otherCount + unspecifiedCount;

  const malePercent = totalGenderCount > 0 ? Math.round((maleCount / totalGenderCount) * 100) : 0;
  const femalePercent = totalGenderCount > 0 ? Math.round((femaleCount / totalGenderCount) * 100) : 0;
  const otherPercent = totalGenderCount > 0 ? Math.round(((otherCount + unspecifiedCount) / totalGenderCount) * 100) : 0;
  const hasPlacementTrendData = placementTrendData.some((point) => point.total > 0);
  const recentPlacements = stats?.recentPlacements || [];
  const currentHour = new Date().getHours();
  const timeAwareGreeting = currentHour < 12
    ? "Good morning"
    : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Personalized Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-gray-100 relative overflow-hidden">
        {/* Background decorative blob */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            {timeAwareGreeting}, {user?.name || 'Administrator'}
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
                {(stats?.academicSummary?.currentEnrolled ?? stats?.totalLearners ?? 0)} Current Enrolled
             </div>
             <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs items-center inline-flex font-bold border border-emerald-100">
                <GraduationCap className="w-3 h-3 mr-1" />
                {stats?.academicSummary?.graduated || 0} Graduated
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
              <CardContent className="p-4 md:p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-violet-100/50 backdrop-blur-sm rounded-2xl inline-block">
                    <Users className="h-6 w-6 text-violet-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl md:text-2xl font-black text-gray-900 leading-tight">
                    {maleCount}M : {femaleCount}F
                  </h3>
                  <p className="text-sm font-bold text-gray-400">Gender Aggregation</p>
                  
                  {totalGenderCount > 0 ? (
                    <div className="pt-2">
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                        {malePercent > 0 && (
                          <div
                            style={{ width: `${malePercent}%` }}
                            className="h-full bg-indigo-500 transition-all duration-500"
                            title={`Male: ${maleCount} (${malePercent}%)`}
                          />
                        )}
                        {femalePercent > 0 && (
                          <div
                            style={{ width: `${femalePercent}%` }}
                            className="h-full bg-pink-500 transition-all duration-500"
                            title={`Female: ${femaleCount} (${femalePercent}%)`}
                          />
                        )}
                        {otherPercent > 0 && (
                          <div
                            style={{ width: `${otherPercent}%` }}
                            className="h-full bg-amber-400 transition-all duration-500"
                            title={`Other/Unspecified: ${otherCount + unspecifiedCount} (${otherPercent}%)`}
                          />
                        )}
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          {malePercent}% M
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                          {femalePercent}% F
                        </span>
                        {otherPercent > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {otherPercent}% O
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pt-2 font-medium">No gender details available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Delegated Learners Card */}
          {delegatedPlacements && delegatedPlacements.length > 0 && (
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 rounded-[2rem] shadow-lg overflow-hidden">
              <CardHeader className="p-6 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-100 rounded-2xl">
                      <Handshake className="h-6 w-6 text-amber-700" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-amber-900">Delegated to Me</CardTitle>
                      <CardDescription className="text-amber-700 font-medium">Learners from other institutions assigned to you for monitoring</CardDescription>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 bg-amber-200 text-amber-800 rounded-full text-sm font-black">
                    {delegatedPlacements.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-3">
                  {delegatedPlacements.length > 5 && (
                    <p className="text-xs font-bold text-amber-800">
                      Showing 5 of {delegatedPlacements.length} delegated placements.
                    </p>
                  )}
                  {delegatedPlacements.slice(0, 5).map((p: any, index) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => navigate('/delegated-placements')}
                      className="w-full text-left p-4 rounded-2xl bg-white/80 border border-amber-100 hover:border-amber-300 hover:bg-white transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-800">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm">{p.learner?.name || 'Learner'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            From <strong>{p.institution}</strong> · {p.companyName}
                          </p>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-500" />
                      </div>
                    </button>
                  ))}
                  {delegatedPlacements.length > 5 && (
                    <Button
                      variant="ghost"
                      className="w-full text-amber-700 font-bold hover:text-amber-900 hover:bg-amber-100/50"
                      onClick={() => navigate('/delegated-placements')}
                    >
                      View all {delegatedPlacements.length} delegated placements
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {stats?.academicSummary && (
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-6 md:p-8 pb-4 border-b border-gray-50">
                <CardTitle className="text-2xl font-black">Academic Lifecycle</CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                  Current enrolled learners are now tracked separately from graduates and WEL completion.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-8">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <button type="button" onClick={() => openLearnerRegister({ academicStatus: "CurrentEnrolled" })} className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5 text-left transition hover:bg-indigo-100/70">
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <Users className="h-5 w-5 text-indigo-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Enrolled</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-indigo-700">{stats.academicSummary.currentEnrolled}</div>
                    <p className="mt-1 text-sm font-bold text-indigo-800/70">Active + graduating learners</p>
                  </button>
                  <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Active" })} className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5 text-left transition hover:bg-sky-100/70">
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <TrendingUp className="h-5 w-5 text-sky-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-sky-700">Active</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-sky-700">{stats.academicSummary.active}</div>
                    <p className="mt-1 text-sm font-bold text-sky-800/70">Continuing learners</p>
                  </button>
                  <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduating" })} className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5 text-left transition hover:bg-amber-100/70">
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <ArrowUpRight className="h-5 w-5 text-amber-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-amber-700">Graduating</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-amber-700">{stats.academicSummary.graduating}</div>
                    <p className="mt-1 text-sm font-bold text-amber-800/70">Final-year learners nearing exit</p>
                  </button>
                  <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduated" })} className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5 text-left transition hover:bg-emerald-100/70">
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <GraduationCap className="h-5 w-5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Graduated</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-emerald-700">{stats.academicSummary.graduated}</div>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Completed academic cycle</p>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {stats?.intakeCohorts && stats.intakeCohorts.length > 0 && (
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-6 md:p-8 pb-4 border-b border-gray-50">
                <CardTitle className="text-2xl font-black">Cohort Comparison</CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                  Intake-year view of current enrolled, graduating, and graduated learners.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-8">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {stats.intakeCohorts.map((cohort) => (
                    <button
                      key={cohort.intakeAcademicYear}
                      type="button"
                      onClick={() => openLearnerRegister({ intakeAcademicYear: cohort.intakeAcademicYear })}
                      className="rounded-[1.5rem] border border-gray-100 bg-gray-50 p-5 text-left transition hover:bg-gray-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-500">Intake</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-gray-700">{cohort.totalLearners} total</span>
                      </div>
                      <div className="mt-4 text-2xl font-black text-gray-900">{cohort.intakeAcademicYear}</div>
                      {cohort.riskLevel && cohort.riskLevel !== 'low' && (
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                          cohort.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {cohort.riskLevel} risk
                        </div>
                      )}
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-sky-50 px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Current</p>
                          <p className="mt-1 text-xl font-black text-sky-700">{cohort.currentEnrolled}</p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Grad.</p>
                          <p className="mt-1 text-xl font-black text-amber-700">{cohort.graduating}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Done</p>
                          <p className="mt-1 text-xl font-black text-emerald-700">{cohort.graduated}</p>
                        </div>
                      </div>
                      {cohort.riskReasons && cohort.riskReasons.length > 0 && (
                        <p className="mt-3 text-xs font-bold text-gray-500">{cohort.riskReasons[0]}</p>
                      )}
                      {cohort.riskLevel && cohort.riskLevel !== 'low' && (
                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl border-gray-200 bg-white font-bold"
                            onClick={(event) => {
                              event.stopPropagation();
                              openInterventionQueue({ intakeAcademicYear: cohort.intakeAcademicYear, risk: 'at-risk' });
                            }}
                          >
                            View Intervention Queue
                          </Button>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {institutionPerformance && (
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-6 md:p-8 pb-4 border-b border-gray-50">
                <CardTitle className="text-2xl font-black">Institution Performance</CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                  Live operational performance derived from placements, attendance, visits, assessments, and support tickets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-8">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => navigate('/placements')}
                    className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5 text-left transition hover:bg-emerald-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <Briefcase className="h-5 w-5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Coverage</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-emerald-700">
                      {institutionPerformance.placementCoverageRate}%
                    </div>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Placement coverage rate</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => openLearnerRegister({ status: "Placed" })}
                    className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5 text-left transition hover:bg-indigo-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <Users className="h-5 w-5 text-indigo-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Active</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-indigo-700">
                      {institutionPerformance.activeLearnerCount}
                    </div>
                    <p className="mt-1 text-sm font-bold text-indigo-800/70">Learners in active placements</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/attendance-logs?status=Pending')}
                    className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5 text-left transition hover:bg-amber-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-amber-700">Overdue</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-amber-700">
                      {institutionPerformance.overdueAttendanceRate}%
                    </div>
                    <p className="mt-1 text-sm font-bold text-amber-800/70">Attendance overdue rate</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/monitoring-visits')}
                    className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5 text-left transition hover:bg-sky-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <ClipboardList className="h-5 w-5 text-sky-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-sky-700">Visits</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-sky-700">
                      {institutionPerformance.monitoringCoverageRate}%
                    </div>
                    <p className="mt-1 text-sm font-bold text-sky-800/70">Monitoring coverage rate</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/assessments')}
                    className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5 text-left transition hover:bg-violet-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <TrendingUp className="h-5 w-5 text-violet-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-violet-700">Assessments</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-violet-700">
                      {institutionPerformance.assessmentCompletionRate}%
                    </div>
                    <p className="mt-1 text-sm font-bold text-violet-800/70">Assessment completion rate</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/support-center?status=Open')}
                    className="rounded-[1.5rem] border border-rose-100 bg-rose-50/70 p-5 text-left transition hover:bg-rose-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <FileText className="h-5 w-5 text-rose-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-rose-700">Backlog</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-rose-700">
                      {institutionPerformance.supportBacklog}
                    </div>
                    <p className="mt-1 text-sm font-bold text-rose-800/70">Open support issues</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/support-center?sla=breached')}
                    className="rounded-[1.5rem] border border-red-100 bg-red-50/70 p-5 text-left transition hover:bg-red-100/70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-white/80">
                        <Timer className="h-5 w-5 text-red-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-red-700">SLA</span>
                    </div>
                    <div className="mt-5 text-3xl font-black text-red-700">
                      {institutionPerformance.slaBreachCount}
                    </div>
                    <p className="mt-1 text-sm font-bold text-red-800/70">Breached institution-owned issues</p>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

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
                  Semester placement trends across recent academic cycles.
                </CardDescription>
              </CardHeader>
              <CardContent data-help-id="dashboard-overview" className="p-4 md:p-8 pt-4">
                {isFetching && placementTrendData.length === 0 ? (
                  <Skeleton className="h-[350px] rounded-2xl" />
                ) : hasPlacementTrendData ? (
                  <Overview data={placementTrendData} />
                ) : (
                  <div className="flex h-[350px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-center">
                    <div>
                      <p className="text-sm font-black text-gray-700">No placement trend data yet</p>
                      <p className="mt-1 text-xs font-medium text-gray-500">Placement activity will appear here once learners are placed.</p>
                    </div>
                  </div>
                )}
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
                {isFetching && recentPlacements.length === 0 ? (
                  <div className="space-y-3 p-6">
                    {[...Array(3)].map((_, index) => (
                      <Skeleton key={index} className="h-16 rounded-2xl" />
                    ))}
                  </div>
                ) : recentPlacements.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 font-medium">No recent activity found.</div>
                ) : (
                  recentPlacements.map((learner, index) => {
                    const colors = [
                      'bg-indigo-100 text-indigo-700',
                      'bg-emerald-100 text-emerald-700',
                      'bg-amber-100 text-amber-700',
                      'bg-pink-100 text-pink-700',
                      'bg-cyan-100 text-cyan-700'
                    ];
                    const colorClass = colors[index % colors.length];

                    return (
                      <button
                        key={learner._id}
                        type="button"
                        onClick={() => navigate(`/learners/${learner._id}`)}
                        className="w-full flex items-center text-left group cursor-pointer hover:bg-gray-50/80 p-4 md:p-6 transition-all duration-300"
                      >
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
                      </button>
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
