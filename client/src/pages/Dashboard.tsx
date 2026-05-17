import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Overview } from "@/components/dashboard/Overview"
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget"
import { Users, Briefcase, Clock, ArrowUpRight, Download, Building2, ClipboardList, FileText, TrendingUp, Timer, Plus, FileSpreadsheet, GraduationCap, Handshake, CheckCircle2, LifeBuoy, ShieldCheck, AlertTriangle, ArrowRight, TrendingDown, Minus } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Line, LineChart } from "recharts"
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from "date-fns"

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
  academicSummary?: {
    currentEnrolled: number;
    active: number;
    graduating: number;
    graduated: number;
    dropped: number;
  };
  intakeCohorts?: {
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    placementRate?: number;
    dropRate?: number;
    riskLevel?: string;
    riskReasons?: string[];
    regionCount?: number;
    institutionCount?: number;
  }[];
  monthlyStats: { name: string; total: number }[];
  recentPlacements: SimpleLearner[];
  institutionPerformance?: {
    placementCoverageRate: number;
    activeLearnerCount: number;
    overdueAttendanceRate: number;
    monitoringCoverageRate: number;
    assessmentCompletionRate: number;
    supportBacklog: number;
    slaBreachCount: number;
  };
}
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton"
import { GeolocatedMonitoringMap } from "@/components/dashboard/GeolocatedMonitoringMap"
import { useEffect, useState } from "react";

interface ApprovalQueueItem {
  _id: string;
  institution: string;
  title: string;
  status: string;
  createdAt: string;
  ageDays: number;
}

interface SupportQueueItem {
  _id: string;
  subject: string;
  priority: string;
  status: string;
  institution: string;
  region: string;
  requesterName: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}

interface SensitiveEvent {
  _id: string;
  action: string;
  entityType: string;
  summary: string;
  actorName: string;
  actorRole: string;
  institution: string;
  createdAt: string;
}

interface RegionalStat {
  region: string;
  totalLearners: number;
  currentEnrolled: number;
  academicGraduated: number;
  placed: number;
  completed: number;
  institutionCount: number;
  placementRate: number;
  completionRate: number;
  currentSemesterPlacements: number;
  previousSemesterPlacements: number;
  semesterOverSemesterDelta: number;
  semesterOverSemesterPercent: number;
  movementDirection: "up" | "down" | "flat";
  needsIntervention: boolean;
  interventionReasons: string[];
  sparkline: { period: string; count: number }[];
}

type AdminOverviewStats = DashboardStats & {
  totalInstitutions: number;
  totalUsers: number;
  totalPlacements: number;
  totalVisits: number;
  totalReports: number;
  totalPartners?: number;
  overallPlacementRate: number;
  academicSummary?: {
    currentEnrolled: number;
    active: number;
    graduating: number;
    graduated: number;
    dropped: number;
  };
  intakeCohorts?: {
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    regionCount: number;
    institutionCount: number;
    riskLevel?: string;
    riskReasons?: string[];
  }[];
  regionalCohortBreakdown?: {
    region: string;
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    institutionCount: number;
  }[];
  institutionCohortBreakdown?: {
    institution: string;
    region: string;
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
  }[];
  placementTrend: { name: string; year: number; month: number; count: number }[];
  regionalStats: RegionalStat[];
  institutionStats: {
    _id: string;
    totalLearners: number;
    currentEnrolled: number;
    academicActive: number;
    academicGraduating: number;
    academicGraduated: number;
    placed: number;
    pending: number;
    completed: number;
    dropped: number;
  }[];
  genderDistribution: { gender: string; count: number }[];
  programDistribution: { program: string; count: number }[];
  learnerProgressSummary?: {
    totalLearners: number;
    averageProgress: number;
    atRiskCount: number;
    completedCount: number;
    placedCount: number;
    ownershipSummary: {
      assignedCount: number;
      unassignedCount: number;
      atRiskOwnedCount: number;
    };
  };
  learnerQualitySummary?: {
    activeLearnerCount: number;
    overdueAttendanceRate: number;
    monitoringCoverageRate: number;
    gpsVerifiedRate: number;
    avgVisitRating: number;
    assessmentCompletionRate: number;
    avgAssessmentScore: number;
    employerEvaluationCoverageRate: number;
    avgEmployerScore: number;
    wouldHireRate: number;
    assessmentScoreTrend: { name: string; count: number; avgScore: number }[];
    employerOutcomeTrend: { name: string; count: number; avgScore: number; wouldHireRate: number }[];
  };
  pendingReports: number;
  reportPipeline: { status: string; count: number }[];
  approvalInbox?: {
    pendingCount: number;
    overdueCount: number;
    recentRejectedCount: number;
    queue: ApprovalQueueItem[];
  };
  supportSummary?: {
    total: number;
    open: number;
    inProgress: number;
    urgentOpen: number;
    oldestOpenAgeDays: number;
    categoryBreakdown: { category: string; count: number }[];
    regionBreakdown: { region: string; count: number }[];
    queue: SupportQueueItem[];
  };
  auditSummary?: {
    eventsLast7Days: number;
    destructiveEventsLast7Days: number;
    authEventsLast7Days: number;
    statusChangesLast7Days: number;
    topActors: { actorId?: string; actorName: string; actorRole: string; count: number }[];
    recentSensitiveEvents: SensitiveEvent[];
  };
  dataQualityAlerts?: {
    stalePendingLearners: number;
    placementsMissingSupervisor: number;
    pendingAttendanceSignOff: number;
    activePlacementsWithoutVisits: number;
  };
  userGovernance?: {
    inactiveUsers: number;
    pendingPasswordResets: number;
    institutionsWithoutActiveAdmins: { _id: string; name: string; region: string; code: string }[];
    privilegedUserAnomalies: {
      institution: string;
      adminCount: number;
      managerCount: number;
      privilegedCount: number;
      activePrivilegedCount: number;
      reasons: string[];
    }[];
    roleBreakdown: { role: string; count: number }[];
  };
  deadlineRisk?: {
    upcomingDeadlines: {
      _id: string;
      title: string;
      startDate: string;
      endDate: string;
      semester: string;
      academicYear: string;
      description: string;
      daysRemaining: number;
    }[];
    currentCycle: {
      title: string;
      semester: string;
      academicYear: string;
      endDate: string;
      daysRemaining: number;
      isOverdue: boolean;
    } | null;
    overdueInstitutionSubmissions: {
      _id: string;
      institution: string;
      region: string;
      status: string;
      code: string;
    }[];
    atRiskInstitutions: {
      _id: string;
      institution: string;
      region: string;
      status: string;
      code: string;
      daysRemaining: number;
    }[];
  };
};

export default function Dashboard() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();
  const [regionalSortBy, setRegionalSortBy] = useState<"placementRate" | "completionRate" | "semesterOverSemesterPercent">("placementRate");

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

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats', user?._id, user?.role],
    queryFn: async () => {
      const res = await authFetch(fetchUrl);
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
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

  if (isLoading) {
    if (isAdminView) {
      return <DashboardSkeleton />;
    }
    return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Loading dashboard data...</div>;
  }

  // If SuperAdmin or RegionalAdmin, render the Analytics view
  if (isAdminView && stats && 'totalInstitutions' in stats) {
    const adminData = stats as AdminOverviewStats;
    const qualityAlertItems = [
      {
        label: "Pending learners older than 14 days",
        count: adminData.dataQualityAlerts?.stalePendingLearners || 0,
        tone: "text-amber-700 bg-amber-50",
        target: "/learners",
      },
      {
        label: "Active placements missing supervisor details",
        count: adminData.dataQualityAlerts?.placementsMissingSupervisor || 0,
        tone: "text-red-700 bg-red-50",
        target: "/placements",
      },
      {
        label: "Attendance logs pending sign-off for 3+ days",
        count: adminData.dataQualityAlerts?.pendingAttendanceSignOff || 0,
        tone: "text-indigo-700 bg-indigo-50",
        target: "/attendance-logs",
      },
      {
        label: "Active placements without monitoring visits",
        count: adminData.dataQualityAlerts?.activePlacementsWithoutVisits || 0,
        tone: "text-orange-700 bg-orange-50",
        target: "/monitoring-visits",
      },
    ];

    const sortedRegionalStats = [...(adminData.regionalStats || [])].sort((a, b) => {
      if (regionalSortBy === "completionRate") {
        if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
        return b.placementRate - a.placementRate;
      }

      if (regionalSortBy === "semesterOverSemesterPercent") {
        if (b.semesterOverSemesterPercent !== a.semesterOverSemesterPercent) return b.semesterOverSemesterPercent - a.semesterOverSemesterPercent;
        return b.placementRate - a.placementRate;
      }

      if (b.placementRate !== a.placementRate) return b.placementRate - a.placementRate;
      return b.completionRate - a.completionRate;
    });

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

        {user?.role === 'RegionalAdmin' && (
          <>
            <GeolocatedMonitoringMap />

            <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
              <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-4 md:p-8 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        Approval Inbox
                      </CardTitle>
                      <CardDescription className="text-base font-bold text-gray-400 mt-2">
                        Reports in your region waiting for review or follow-up.
                      </CardDescription>
                    </div>
                    <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/semester-reports')}>
                      Open Reports
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-8 pt-2 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl bg-green-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-green-500">Pending</p>
                      <p className="text-3xl font-black text-green-700 mt-2">{adminData.approvalInbox?.pendingCount || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-500">Over 7 Days</p>
                      <p className="text-3xl font-black text-amber-700 mt-2">{adminData.approvalInbox?.overdueCount || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-red-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-red-500">Recent Rejections</p>
                      <p className="text-3xl font-black text-red-700 mt-2">{adminData.approvalInbox?.recentRejectedCount || 0}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {adminData.approvalInbox?.queue?.length ? (
                      adminData.approvalInbox.queue.map((item) => (
                        <div key={item._id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-black text-gray-900">{item.institution}</p>
                              <p className="text-sm font-medium text-gray-500">{item.title}</p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-700 border-0">{item.ageDays}d waiting</Badge>
                          </div>
                          <p className="text-xs font-bold text-gray-400 mt-2">
                            Submitted {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm font-medium text-gray-500">No reports are currently waiting for regional review.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-4 md:p-8 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black flex items-center gap-3">
                        <LifeBuoy className="h-6 w-6 text-[#FFB800]" />
                        Support Escalation Queue
                      </CardTitle>
                      <CardDescription className="text-base font-bold text-gray-400 mt-2">
                        Regional support workload and unresolved escalations.
                      </CardDescription>
                    </div>
                    <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/support-center')}>
                      Open Support
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-8 pt-2 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-500">Open</p><p className="text-3xl font-black text-amber-700 mt-2">{adminData.supportSummary?.open || 0}</p></div>
                    <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-500">In Progress</p><p className="text-3xl font-black text-blue-700 mt-2">{adminData.supportSummary?.inProgress || 0}</p></div>
                    <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-500">Urgent</p><p className="text-3xl font-black text-red-700 mt-2">{adminData.supportSummary?.urgentOpen || 0}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Oldest Age</p><p className="text-3xl font-black text-slate-700 mt-2">{adminData.supportSummary?.oldestOpenAgeDays || 0}d</p></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                      <p className="text-sm font-black text-gray-900 mb-3">By Category</p>
                      <div className="space-y-2">
                        {adminData.supportSummary?.categoryBreakdown?.length ? adminData.supportSummary.categoryBreakdown.slice(0, 4).map((item) => (
                          <div key={item.category} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-600">{item.category}</span>
                            <span className="font-black text-gray-900">{item.count}</span>
                          </div>
                        )) : <p className="text-sm text-gray-500">No unresolved tickets.</p>}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                      <p className="text-sm font-black text-gray-900 mb-3">By Region</p>
                      <div className="space-y-2">
                        {adminData.supportSummary?.regionBreakdown?.length ? adminData.supportSummary.regionBreakdown.slice(0, 4).map((item) => (
                          <div key={item.region} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-600">{item.region || 'Unassigned'}</span>
                            <span className="font-black text-gray-900">{item.count}</span>
                          </div>
                        )) : <p className="text-sm text-gray-500">No unresolved tickets.</p>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {adminData.supportSummary?.queue?.length ? adminData.supportSummary.queue.slice(0, 4).map((ticket) => (
                      <div key={ticket._id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-black text-gray-900">{ticket.subject}</p>
                            <p className="text-sm font-medium text-gray-500">{ticket.institution} · {ticket.requesterName}</p>
                          </div>
                          <Badge className={ticket.priority === 'Urgent' ? 'bg-red-500 text-white border-0' : ticket.priority === 'High' ? 'bg-orange-100 text-orange-700 border-0' : 'bg-slate-100 text-slate-700 border-0'}>
                            {ticket.priority}
                          </Badge>
                        </div>
                        <p className="text-xs font-bold text-gray-400 mt-2">
                          Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })} · {ticket.replyCount} repl{ticket.replyCount === 1 ? 'y' : 'ies'}
                        </p>
                      </div>
                    )) : <p className="text-sm font-medium text-gray-500">No open support escalations.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {adminData.academicSummary && (
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <CardTitle className="text-2xl font-black">Academic Lifecycle</CardTitle>
              <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                Separate current enrolled learners from graduating and graduated cohorts.
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
                  <div className="mt-5 text-3xl font-black text-indigo-700">{adminData.academicSummary.currentEnrolled}</div>
                  <p className="mt-1 text-sm font-bold text-indigo-800/70">Current active + graduating learners</p>
                </button>
                <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduating" })} className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5 text-left transition hover:bg-amber-100/70">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <ArrowUpRight className="h-5 w-5 text-amber-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-amber-700">Final Year</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-amber-700">{adminData.academicSummary.graduating}</div>
                  <p className="mt-1 text-sm font-bold text-amber-800/70">Graduating learners</p>
                </button>
                <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduated" })} className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5 text-left transition hover:bg-emerald-100/70">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <GraduationCap className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Alumni</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-emerald-700">{adminData.academicSummary.graduated}</div>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Graduated learners</p>
                </button>
                <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Dropped" })} className="rounded-[1.5rem] border border-rose-100 bg-rose-50/70 p-5 text-left transition hover:bg-rose-100/70">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <Clock className="h-5 w-5 text-rose-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-rose-700">Dropped</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-rose-700">{adminData.academicSummary.dropped}</div>
                  <p className="mt-1 text-sm font-bold text-rose-800/70">Dropped from academic cycle</p>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {adminData.intakeCohorts && adminData.intakeCohorts.length > 0 && (
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Cohort Comparison</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    Intake-year comparison across {user?.role === 'RegionalAdmin' ? 'your region' : 'the platform'}.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCSV(adminData.regionalCohortBreakdown || [], 'regional-cohort-breakdown')}
                    className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
                  >
                    <Download className="mr-2 h-4 w-4" /> Export Regions
                  </Button>
                  {user?.role !== 'RegionalAdmin' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCSV(adminData.institutionCohortBreakdown || [], 'institution-cohort-breakdown')}
                      className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
                    >
                      <Download className="mr-2 h-4 w-4" /> Export Institutions
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {adminData.intakeCohorts.map((cohort) => (
                  <button
                    key={cohort.intakeAcademicYear}
                    type="button"
                    onClick={() => openLearnerRegister({ intakeAcademicYear: cohort.intakeAcademicYear })}
                    className="rounded-[1.5rem] border border-gray-100 bg-gray-50 p-5 text-left transition hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest text-gray-500">Intake</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-gray-700">{cohort.totalLearners} learners</span>
                    </div>
                    <div className="mt-4 text-2xl font-black text-gray-900">{cohort.intakeAcademicYear}</div>
                    {cohort.riskLevel && cohort.riskLevel !== 'low' && (
                      <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                        cohort.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {cohort.riskLevel} risk
                      </div>
                    )}
                    <p className="mt-1 text-xs font-bold text-gray-500">
                      {cohort.regionCount} region{cohort.regionCount !== 1 ? 's' : ''} • {cohort.institutionCount} institution{cohort.institutionCount !== 1 ? 's' : ''}
                    </p>
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

        {adminData.learnerProgressSummary && (
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Learner Risk & Progress</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    HQ intervention summary based on learner progress, placement execution, monitoring, and outcomes.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  className="rounded-xl border-gray-200 font-bold"
                  onClick={() => openInterventionQueue({ risk: 'at-risk' })}
                >
                  Open Intervention Queue
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => openInterventionQueue({ risk: 'at-risk' })}
                  className="rounded-[1.5rem] border border-red-100 bg-red-50/70 p-5 text-left transition hover:bg-red-100/70"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-red-700">At Risk</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-red-700">{adminData.learnerProgressSummary.atRiskCount}</div>
                  <p className="mt-1 text-sm font-bold text-red-800/70">Learners needing intervention</p>
                </button>

                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Progress</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-emerald-700">{adminData.learnerProgressSummary.averageProgress}%</div>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Average learner progress</p>
                </div>

                <button
                  type="button"
                  onClick={() => openLearnerRegister({ status: 'Completed' })}
                  className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5 text-left transition hover:bg-indigo-100/70"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Completed</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-indigo-700">{adminData.learnerProgressSummary.completedCount}</div>
                  <p className="mt-1 text-sm font-bold text-indigo-800/70">Learners who completed WEL</p>
                </button>

                <button
                  type="button"
                  onClick={() => openLearnerRegister({ status: 'Placed' })}
                  className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5 text-left transition hover:bg-sky-100/70"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-white/80">
                      <Briefcase className="h-5 w-5 text-sky-600" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-sky-700">Placed</span>
                  </div>
                  <div className="mt-5 text-3xl font-black text-sky-700">{adminData.learnerProgressSummary.placedCount}</div>
                  <p className="mt-1 text-sm font-bold text-sky-800/70">Learners currently placed</p>
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">Owned Cases</p>
                  <p className="mt-2 text-3xl font-black text-gray-900">{adminData.learnerProgressSummary.ownershipSummary.assignedCount}</p>
                  <p className="mt-1 text-sm font-medium text-gray-500">Learners already assigned to a responsible officer</p>
                </div>
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-500">Unassigned</p>
                  <p className="mt-2 text-3xl font-black text-amber-700">{adminData.learnerProgressSummary.ownershipSummary.unassignedCount}</p>
                  <p className="mt-1 text-sm font-medium text-amber-700/80">Learners with no owner assigned</p>
                </div>
                <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-red-500">At-Risk Owned</p>
                  <p className="mt-2 text-3xl font-black text-red-700">{adminData.learnerProgressSummary.ownershipSummary.atRiskOwnedCount}</p>
                  <p className="mt-1 text-sm font-medium text-red-700/80">At-risk learners already sitting with an owner</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {adminData.learnerQualitySummary && (
          <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Attendance Compliance</CardTitle>
                    <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                      Cadence-based attendance compliance across active placements.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/attendance-logs')}>
                    Open Logs
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Active Placements</p>
                    <p className="mt-4 text-3xl font-black text-indigo-700">{adminData.learnerQualitySummary.activeLearnerCount}</p>
                    <p className="mt-1 text-sm font-bold text-indigo-800/70">Learners currently in WEL</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-700">Overdue Rate</p>
                    <p className="mt-4 text-3xl font-black text-amber-700">{adminData.learnerQualitySummary.overdueAttendanceRate}%</p>
                    <p className="mt-1 text-sm font-bold text-amber-800/70">Placements behind attendance cadence</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Compliant</p>
                    <p className="mt-4 text-3xl font-black text-emerald-700">{Math.max(0, 100 - adminData.learnerQualitySummary.overdueAttendanceRate)}%</p>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Active placements on time</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Monitoring Quality & GPS</CardTitle>
                    <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                      Monitoring coverage, site verification, and average observed performance.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/monitoring-visits')}>
                    Open Visits
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-sky-700">Coverage</p>
                    <p className="mt-4 text-3xl font-black text-sky-700">{adminData.learnerQualitySummary.monitoringCoverageRate}%</p>
                    <p className="mt-1 text-sm font-bold text-sky-800/70">Placements with monitoring in cadence</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-violet-700">GPS Verified</p>
                    <p className="mt-4 text-3xl font-black text-violet-700">{adminData.learnerQualitySummary.gpsVerifiedRate}%</p>
                    <p className="mt-1 text-sm font-bold text-violet-800/70">Active placements with verified visit evidence</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Avg Rating</p>
                    <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.avgVisitRating}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Latest monitoring performance rating</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Assessment Outcomes</CardTitle>
                    <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                      Competency assessment completion and score trend over the last 6 months.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/assessments')}>
                    Open Assessments
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-violet-700">Completion</p>
                    <p className="mt-4 text-3xl font-black text-violet-700">{adminData.learnerQualitySummary.assessmentCompletionRate}%</p>
                    <p className="mt-1 text-sm font-bold text-violet-800/70">Active placements with at least one assessment</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Avg Score</p>
                    <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.avgAssessmentScore}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Average latest assessment score</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">6-Month Assessment Score Trend</p>
                    <p className="text-xs font-bold text-gray-500">Average score by month</p>
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={adminData.learnerQualitySummary.assessmentScoreTrend}>
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}
                          formatter={(value: number, name: string) => [value, name === 'avgScore' ? 'Avg score' : 'Count']}
                        />
                        <Line type="monotone" dataKey="avgScore" stroke="#7c3aed" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: '#7c3aed' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Employer Evaluation Outcomes</CardTitle>
                    <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                      Employer feedback coverage, average score, and willingness to hire.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-700">Coverage</p>
                    <p className="mt-4 text-3xl font-black text-blue-700">{adminData.learnerQualitySummary.employerEvaluationCoverageRate}%</p>
                    <p className="mt-1 text-sm font-bold text-blue-800/70">Active placements with employer feedback</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-700">Avg Score</p>
                    <p className="mt-4 text-3xl font-black text-amber-700">{adminData.learnerQualitySummary.avgEmployerScore}</p>
                    <p className="mt-1 text-sm font-bold text-amber-800/70">Average latest employer rating</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Would Hire</p>
                    <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.wouldHireRate}%</p>
                    <p className="mt-1 text-sm font-bold text-emerald-800/70">Positive hire intent among evaluated learners</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">6-Month Employer Trend</p>
                    <p className="text-xs font-bold text-gray-500">Would-hire rate by month</p>
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={adminData.learnerQualitySummary.employerOutcomeTrend}>
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}
                          formatter={(value: number, name: string) => [value, name === 'wouldHireRate' ? 'Would hire %' : 'Avg score']}
                        />
                        <Line type="monotone" dataKey="wouldHireRate" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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

        {/* Gender Distribution and Trade Distribution */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
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

        </div>

        {user?.role === 'RegionalAdmin' && (
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Regional Performance League Table</CardTitle>
                  <CardDescription className="text-base font-bold text-gray-400 mt-2">
                    Placement rate, completion rate, intervention risk, and semester-on-semester movement across the country.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCSV(sortedRegionalStats, 'regional-performance-league')}
                  className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
                >
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-xs font-black uppercase tracking-widest text-gray-400">Rank By</span>
                <button
                  onClick={() => setRegionalSortBy("placementRate")}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${regionalSortBy === "placementRate" ? "bg-[#FFB800] text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  Placement Rate
                </button>
                <button
                  onClick={() => setRegionalSortBy("completionRate")}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${regionalSortBy === "completionRate" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  Completion Rate
                </button>
                <button
                  onClick={() => setRegionalSortBy("semesterOverSemesterPercent")}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${regionalSortBy === "semesterOverSemesterPercent" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  SoS Movement
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 pt-2">
              {(sortedRegionalStats.length || 0) === 0 ? (
                <p className="text-center text-gray-400 py-8">No regional data available yet.</p>
              ) : (
                <div className="space-y-4">
                  {sortedRegionalStats.map((region, index) => {
                    const MovementIcon = region.movementDirection === "up"
                      ? TrendingUp
                      : region.movementDirection === "down"
                        ? TrendingDown
                        : Minus;

                    const movementTone = region.movementDirection === "up"
                      ? "text-green-700 bg-green-50"
                      : region.movementDirection === "down"
                        ? "text-red-700 bg-red-50"
                        : "text-slate-700 bg-slate-50";

                    return (
                      <div key={region.region} className="rounded-[1.75rem] border border-gray-100 p-6 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
                          <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg ${index < 3 ? 'bg-[#FFB800] text-gray-900' : 'bg-white text-gray-700 border border-gray-200'}`}>
                              #{index + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="text-xl font-black text-gray-900">{region.region || 'Unknown'}</h3>
                                {region.needsIntervention && (
                                  <Badge className="bg-red-100 text-red-700 border-0">Needs intervention</Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-500 mt-1">
                                {region.institutionCount} institutions • {region.totalLearners} learners
                              </p>
                            </div>
                          </div>
                          <div className={`inline-flex items-center gap-2 px-4 py-3 rounded-2xl font-black ${movementTone}`}>
                            <MovementIcon className="h-4 w-4" />
                            <span>{region.movementDirection === "up" ? "+" : region.movementDirection === "down" ? "" : ""}{region.semesterOverSemesterPercent}%</span>
                            <span className="text-xs font-bold opacity-70">SoS</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Placement Rate</span>
                            <span className={`text-2xl font-black ${region.placementRate >= 70 ? 'text-green-600' : region.placementRate >= 45 ? 'text-amber-600' : 'text-red-600'}`}>
                              {Math.round(region.placementRate)}%
                            </span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Completion Rate</span>
                            <span className={`text-2xl font-black ${region.completionRate >= 35 ? 'text-green-600' : region.completionRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                              {Math.round(region.completionRate)}%
                            </span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Current Semester</span>
                            <span className="text-2xl font-black text-gray-900">{region.currentSemesterPlacements}</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Previous Semester</span>
                            <span className="text-2xl font-black text-gray-900">{region.previousSemesterPlacements}</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Completed</span>
                            <span className="text-2xl font-black text-indigo-600">{region.completed}</span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                              <span>Placement Progress</span>
                              <span>{Math.round(region.placementRate)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div className="bg-[#FFB800] h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(region.placementRate, 100)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                              <span>Completion Progress</span>
                              <span>{Math.round(region.completionRate)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(region.completionRate, 100)}%` }} />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-white border border-gray-100 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400">4-Semester Placement Trend</p>
                            <p className="text-xs font-bold text-gray-500">
                              {region.sparkline?.[0]?.period} to {region.sparkline?.[(region.sparkline?.length || 1) - 1]?.period}
                            </p>
                          </div>
                          <div className="h-20">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={region.sparkline}>
                                <Tooltip
                                  cursor={false}
                                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}
                                  labelStyle={{ color: '#6b7280', fontWeight: 700 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="count"
                                  stroke={region.needsIntervention ? "#ef4444" : "#f59e0b"}
                                  strokeWidth={3}
                                  dot={false}
                                  activeDot={{ r: 4, fill: region.needsIntervention ? "#ef4444" : "#f59e0b" }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {region.sparkline?.map((point) => (
                              <div key={`${region.region}-${point.period}`} className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{point.period}</p>
                                <p className="text-xs font-bold text-gray-700 mt-1">{point.count}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {region.needsIntervention && region.interventionReasons.length > 0 && (
                          <div className="mt-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                            <p className="text-xs font-black uppercase tracking-widest text-red-500 mb-2">Intervention Reasons</p>
                            <div className="flex flex-wrap gap-2">
                              {region.interventionReasons.map((reason) => (
                                <Badge key={reason} className="bg-white text-red-700 border border-red-200">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                        <span className="text-[11px] font-bold text-gray-500 mt-1">
                          {reg.currentEnrolled} current enrolled • {reg.academicGraduated} graduated
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

        {user?.role === 'RegionalAdmin' && (
          <>
            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Calendar & Deadline Risk</CardTitle>
                    <CardDescription className="text-base font-bold text-gray-400 mt-2">
                      Upcoming deadlines, overdue submissions, and institutions at risk in your region.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/semester-reports')}>
                    Open Reports
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 pt-2 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-500">Upcoming Deadlines</p><p className="text-3xl font-black text-blue-700 mt-2">{adminData.deadlineRisk?.upcomingDeadlines?.length || 0}</p></div>
                  <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-500">Overdue Institutions</p><p className="text-3xl font-black text-red-700 mt-2">{adminData.deadlineRisk?.overdueInstitutionSubmissions?.length || 0}</p></div>
                  <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-500">At Risk This Cycle</p><p className="text-3xl font-black text-amber-700 mt-2">{adminData.deadlineRisk?.atRiskInstitutions?.length || 0}</p></div>
                  <div className="rounded-2xl bg-purple-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-purple-500">Current Cycle</p><p className="text-sm font-black text-purple-700 mt-2">{adminData.deadlineRisk?.currentCycle ? `${adminData.deadlineRisk.currentCycle.semester} ${adminData.deadlineRisk.currentCycle.academicYear}` : 'No active cycle'}</p></div>
                </div>

                {adminData.deadlineRisk?.currentCycle && (
                  <div className={`rounded-2xl border px-5 py-4 ${adminData.deadlineRisk.currentCycle.isOverdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">Current Reporting Cycle</p>
                        <p className="text-lg font-black text-gray-900 mt-1">{adminData.deadlineRisk.currentCycle.title}</p>
                        <p className="text-sm font-medium text-gray-600 mt-1">
                          Due {formatDistanceToNow(new Date(adminData.deadlineRisk.currentCycle.endDate), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge className={adminData.deadlineRisk.currentCycle.isOverdue ? 'bg-red-500 text-white border-0' : 'bg-amber-100 text-amber-700 border-0'}>
                        {adminData.deadlineRisk.currentCycle.isOverdue ? 'Overdue' : `${adminData.deadlineRisk.currentCycle.daysRemaining} days remaining`}
                      </Badge>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">Upcoming Deadlines</p>
                    <div className="space-y-3">
                      {adminData.deadlineRisk?.upcomingDeadlines?.length ? adminData.deadlineRisk.upcomingDeadlines.map((deadline) => (
                        <div key={deadline._id} className="rounded-xl bg-white border border-gray-100 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{deadline.title}</p>
                              <p className="text-xs font-medium text-gray-500 mt-1">{deadline.semester} {deadline.academicYear}</p>
                            </div>
                            <Badge className="bg-blue-100 text-blue-700 border-0">{deadline.daysRemaining}d</Badge>
                          </div>
                          <p className="text-xs font-medium text-gray-500 mt-2">
                            Ends {formatDistanceToNow(new Date(deadline.endDate), { addSuffix: true })}
                          </p>
                        </div>
                      )) : <p className="text-sm text-gray-500">No upcoming deadline events found.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">Overdue Institution Submissions</p>
                    <div className="space-y-3">
                      {adminData.deadlineRisk?.overdueInstitutionSubmissions?.length ? adminData.deadlineRisk.overdueInstitutionSubmissions.map((item) => (
                        <button
                          key={item._id}
                          onClick={() => navigate(`/semester-reports?deadlineView=overdue&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(adminData.deadlineRisk?.currentCycle?.semester || '')}&academicYear=${encodeURIComponent(adminData.deadlineRisk?.currentCycle?.academicYear || '')}`)}
                          className="w-full text-left rounded-xl bg-white border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{item.institution}</p>
                              <p className="text-xs font-medium text-gray-500 mt-1">{item.region} · {item.code}</p>
                            </div>
                            <Badge className="bg-red-100 text-red-700 border-0">{item.status}</Badge>
                          </div>
                        </button>
                      )) : <p className="text-sm text-gray-500">No overdue institution submissions.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">At Risk of Missing Current Cycle</p>
                    <div className="space-y-3">
                      {adminData.deadlineRisk?.atRiskInstitutions?.length ? adminData.deadlineRisk.atRiskInstitutions.map((item) => (
                        <button
                          key={item._id}
                          onClick={() => navigate(`/semester-reports?deadlineView=at-risk&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(adminData.deadlineRisk?.currentCycle?.semester || '')}&academicYear=${encodeURIComponent(adminData.deadlineRisk?.currentCycle?.academicYear || '')}`)}
                          className="w-full text-left rounded-xl bg-white border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{item.institution}</p>
                              <p className="text-xs font-medium text-gray-500 mt-1">{item.region} · {item.code}</p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-700 border-0">{item.daysRemaining}d left</Badge>
                          </div>
                          <p className="text-xs font-medium text-gray-500 mt-2">Current report state: {item.status}</p>
                        </button>
                      )) : <p className="text-sm text-gray-500">No institutions currently flagged as at risk.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-4 md:p-8 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Regional User Governance</CardTitle>
                    <CardDescription className="text-base font-bold text-gray-400 mt-2">
                      Role distribution, inactive accounts, orphaned institutions, and privileged-access anomalies in your region.
                    </CardDescription>
                  </div>
                  <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/users')}>
                    Open Users
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 pt-2 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button onClick={() => navigate('/users')} className="rounded-2xl bg-blue-50 p-4 text-left hover:bg-blue-100 transition-colors">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-500">Roles Tracked</p>
                    <p className="text-3xl font-black text-blue-700 mt-2">{adminData.userGovernance?.roleBreakdown?.length || 0}</p>
                  </button>
                  <button onClick={() => navigate('/users?status=Inactive')} className="rounded-2xl bg-red-50 p-4 text-left hover:bg-red-100 transition-colors">
                    <p className="text-xs font-black uppercase tracking-wider text-red-500">Inactive Users</p>
                    <p className="text-3xl font-black text-red-700 mt-2">{adminData.userGovernance?.inactiveUsers || 0}</p>
                  </button>
                  <button onClick={() => navigate('/users?governance=password-reset-pending')} className="rounded-2xl bg-amber-50 p-4 text-left hover:bg-amber-100 transition-colors">
                    <p className="text-xs font-black uppercase tracking-wider text-amber-500">Password Resets Pending</p>
                    <p className="text-3xl font-black text-amber-700 mt-2">{adminData.userGovernance?.pendingPasswordResets || 0}</p>
                  </button>
                  <button onClick={() => navigate('/users?governance=orphaned-institutions&role=Admin&status=Active')} className="rounded-2xl bg-purple-50 p-4 text-left hover:bg-purple-100 transition-colors">
                    <p className="text-xs font-black uppercase tracking-wider text-purple-500">Orphaned Institutions</p>
                    <p className="text-3xl font-black text-purple-700 mt-2">{adminData.userGovernance?.institutionsWithoutActiveAdmins?.length || 0}</p>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">Users by Role</p>
                    <div className="space-y-3">
                      {adminData.userGovernance?.roleBreakdown?.length ? adminData.userGovernance.roleBreakdown.map((item) => (
                        <div key={item.role} className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-600">{item.role}</span>
                          <Badge className="bg-white text-gray-900 border border-gray-200">{item.count}</Badge>
                        </div>
                      )) : <p className="text-sm text-gray-500">No user data available.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">Institutions Without Active Admins</p>
                    <div className="space-y-3">
                      {adminData.userGovernance?.institutionsWithoutActiveAdmins?.length ? adminData.userGovernance.institutionsWithoutActiveAdmins.map((institution) => (
                        <div key={institution._id} className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="font-bold text-gray-900 text-sm">{institution.name}</p>
                          <p className="text-xs font-medium text-gray-500 mt-1">{institution.region} · {institution.code}</p>
                        </div>
                      )) : <p className="text-sm text-gray-500">Every institution currently has an active admin.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                    <p className="text-sm font-black text-gray-900 mb-4">Privileged Access Anomalies</p>
                    <div className="space-y-3">
                      {adminData.userGovernance?.privilegedUserAnomalies?.length ? adminData.userGovernance.privilegedUserAnomalies.map((entry) => (
                        <div key={entry.institution} className="rounded-xl bg-white border border-gray-100 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{entry.institution}</p>
                              <p className="text-xs font-medium text-gray-500 mt-1">
                                {entry.activePrivilegedCount} active privileged users · {entry.adminCount} admins · {entry.managerCount} managers
                              </p>
                            </div>
                            <Badge className="bg-red-100 text-red-700 border-0">Flagged</Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {entry.reasons.map((reason) => (
                              <Badge key={`${entry.institution}-${reason}`} className="bg-white text-red-700 border border-red-200">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )) : <p className="text-sm text-gray-500">No privileged-access anomalies detected.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
              <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-4 md:p-8 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black flex items-center gap-3">
                        <ShieldCheck className="h-6 w-6 text-indigo-600" />
                        Audit & Compliance Snapshot
                      </CardTitle>
                      <CardDescription className="text-base font-bold text-gray-400 mt-2">
                        Sensitive regional activity from the last 7 days.
                      </CardDescription>
                    </div>
                    <Button data-help-id="dashboard-audit-link" variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/activity-log')}>
                      Open Audit Log
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-8 pt-2 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Events</p><p className="text-3xl font-black text-slate-700 mt-2">{adminData.auditSummary?.eventsLast7Days || 0}</p></div>
                    <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-500">Deletes</p><p className="text-3xl font-black text-red-700 mt-2">{adminData.auditSummary?.destructiveEventsLast7Days || 0}</p></div>
                    <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-500">Status Changes</p><p className="text-3xl font-black text-amber-700 mt-2">{adminData.auditSummary?.statusChangesLast7Days || 0}</p></div>
                    <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-500">Auth Events</p><p className="text-3xl font-black text-blue-700 mt-2">{adminData.auditSummary?.authEventsLast7Days || 0}</p></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                      <p className="text-sm font-black text-gray-900 mb-3">Top Actors</p>
                      <div className="space-y-3">
                        {adminData.auditSummary?.topActors?.length ? adminData.auditSummary.topActors.map((actor) => (
                          <div key={`${actor.actorId || actor.actorName}-${actor.actorRole}`} className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{actor.actorName}</p>
                              <p className="text-xs font-medium text-gray-500">{actor.actorRole}</p>
                            </div>
                            <Badge className="bg-indigo-100 text-indigo-700 border-0">{actor.count} events</Badge>
                          </div>
                        )) : <p className="text-sm text-gray-500">No recent audit activity.</p>}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                      <p className="text-sm font-black text-gray-900 mb-3">Recent Sensitive Events</p>
                      <div className="space-y-3">
                        {adminData.auditSummary?.recentSensitiveEvents?.length ? adminData.auditSummary.recentSensitiveEvents.slice(0, 4).map((event) => (
                          <div key={event._id}>
                            <p className="font-bold text-gray-900 text-sm">{event.summary}</p>
                            <p className="text-xs font-medium text-gray-500">{event.actorName} · {event.action} · {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</p>
                          </div>
                        )) : <p className="text-sm text-gray-500">No sensitive events captured in the last week.</p>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-4 md:p-8 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black flex items-center gap-3">
                        <AlertTriangle className="h-6 w-6 text-red-500" />
                        Data Quality Alerts
                      </CardTitle>
                      <CardDescription className="text-base font-bold text-gray-400 mt-2">
                        Operational gaps likely to affect compliance or follow-up in your region.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-8 pt-2 space-y-4">
                  {qualityAlertItems.map((alert) => (
                    <button
                      key={alert.label}
                      onClick={() => navigate(alert.target)}
                      className="w-full rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors p-5 text-left"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-black text-gray-900">{alert.label}</p>
                          <p className="text-sm font-medium text-gray-500 mt-1">Open the relevant workspace to investigate and resolve.</p>
                        </div>
                        <div className={`px-4 py-3 rounded-2xl font-black text-2xl min-w-[88px] text-center ${alert.tone}`}>
                          {alert.count}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm font-black text-indigo-600">
                        Review now <ArrowRight className="h-4 w-4" />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}

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
                          <p className="text-xs font-bold text-gray-500 mt-2">
                            {inst.currentEnrolled} current enrolled • {inst.academicGraduated} graduated
                          </p>
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
  const institutionPerformance = stats?.institutionPerformance;

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
                  {delegatedPlacements.slice(0, 5).map((p: any) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => navigate('/delegated-placements')}
                      className="w-full text-left p-4 rounded-2xl bg-white/80 border border-amber-100 hover:border-amber-300 hover:bg-white transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{p.learner?.name || 'Learner'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            From <strong>{p.institution}</strong> · {p.companyName}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
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
                          <span className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 shadow-sm">
                            View Intervention Queue
                          </span>
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
                  <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50/70 p-5">
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
                  </div>

                  <div className="rounded-[1.5rem] border border-red-100 bg-red-50/70 p-5">
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
                  </div>
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
