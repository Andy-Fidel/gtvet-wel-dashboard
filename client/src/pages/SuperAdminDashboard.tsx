import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { Shield, Users, Building2, Download, Briefcase, FileText, AlertTriangle, CheckCircle2, LifeBuoy, ShieldCheck, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts"
import { InstitutionForm } from "./InstitutionForm"
import { GeolocatedMonitoringMap } from "@/components/dashboard/GeolocatedMonitoringMap"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import gtvetsLogo from '@/assets/gtvets_logo.png'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

interface InstitutionStat {
  _id: string;
  totalLearners: number;
  placed: number;
  pending: number;
  completed: number;
  dropped: number;
}

interface RegionalStat {
  region: string;
  totalLearners: number;
  placed: number;
  completed: number;
  institutionCount: number;
  placementRate: number;
  completionRate: number;
  currentMonthPlacements: number;
  previousMonthPlacements: number;
  monthOverMonthDelta: number;
  monthOverMonthPercent: number;
  movementDirection: "up" | "down" | "flat";
  needsIntervention: boolean;
  interventionReasons: string[];
  sparkline: { month: string; count: number }[];
}

interface OverviewData {
  totalUsers: number;
  totalLearners: number;
  totalPlacements: number;
  totalVisits: number;
  totalReports: number;
  totalInstitutions: number;
  totalPartners: number;
  institutions: string[];
  institutionDetails: any[];
  partnersDetails: any[];
  institutionStats: InstitutionStat[];
  regionalStats: RegionalStat[];
  approvalInbox: {
    pendingCount: number;
    overdueCount: number;
    recentRejectedCount: number;
    queue: { _id: string; institution: string; title: string; status: string; createdAt: string; ageDays: number }[];
    recentRejected: { _id: string; institution: string; title: string; updatedAt: string }[];
  };
  supportSummary: {
    total: number;
    open: number;
    inProgress: number;
    urgentOpen: number;
    oldestOpenAgeDays: number;
    categoryBreakdown: { category: string; count: number }[];
    regionBreakdown: { region: string; count: number }[];
    queue: {
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
    }[];
  };
  auditSummary: {
    eventsLast7Days: number;
    destructiveEventsLast7Days: number;
    authEventsLast7Days: number;
    statusChangesLast7Days: number;
    topActors: { actorId?: string; actorName: string; actorRole: string; count: number }[];
    recentSensitiveEvents: {
      _id: string;
      action: string;
      entityType: string;
      summary: string;
      actorName: string;
      actorRole: string;
      institution: string;
      createdAt: string;
    }[];
  };
  dataQualityAlerts: {
    stalePendingLearners: number;
    placementsMissingSupervisor: number;
    pendingAttendanceSignOff: number;
    activePlacementsWithoutVisits: number;
  };
  userGovernance: {
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
  deadlineRisk: {
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
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [instOpen, setInstOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<any | null>(null);
  const [instSearch, setInstSearch] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
  const [regionalSortBy, setRegionalSortBy] = useState<"placementRate" | "completionRate" | "monthOverMonthPercent">("placementRate");
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    authFetch('/api/admin/overview')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching overview:", err);
        setLoading(false);
      });
  }, [authFetch, refreshKey]);

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

  const downloadPDF = async (dataset: any[], filename: string) => {
    if (!dataset.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = new (jsPDF as any)();
    
    try {
      const img = new Image();
      img.src = gtvetsLogo;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      doc.addImage(img, 'PNG', 14, 10, 25, 25);
      
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59); // text-slate-800
      doc.text("GTVET Institutional Analytics Export", 45, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // text-slate-500
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 45, 26);
    } catch(e) {
      console.warn("Could not load logo for PDF", e);
    }
    
    const rawHeaders = Object.keys(dataset[0]);
    const headers = rawHeaders.map(h => h.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
    
    const rows = dataset.map(item => Object.values(item).map(val => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }));
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (autoTable as any)(doc, {
      startY: 40,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] }
    });
    
    doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading system overview...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-red-500">Failed to load overview data.</div>;
  }

  const qualityAlertItems = [
    {
      label: "Pending learners older than 14 days",
      count: data.dataQualityAlerts?.stalePendingLearners || 0,
      tone: "text-amber-700 bg-amber-50",
      target: "/learners",
    },
    {
      label: "Active placements missing supervisor details",
      count: data.dataQualityAlerts?.placementsMissingSupervisor || 0,
      tone: "text-red-700 bg-red-50",
      target: "/placements",
    },
    {
      label: "Attendance logs pending sign-off for 3+ days",
      count: data.dataQualityAlerts?.pendingAttendanceSignOff || 0,
      tone: "text-indigo-700 bg-indigo-50",
      target: "/attendance-logs",
    },
    {
      label: "Active placements without monitoring visits",
      count: data.dataQualityAlerts?.activePlacementsWithoutVisits || 0,
      tone: "text-orange-700 bg-orange-50",
      target: "/monitoring-visits",
    },
  ];

  const sortedRegionalStats = [...(data.regionalStats || [])].sort((a, b) => {
    if (regionalSortBy === "completionRate") {
      if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
      return b.placementRate - a.placementRate;
    }

    if (regionalSortBy === "monthOverMonthPercent") {
      if (b.monthOverMonthPercent !== a.monthOverMonthPercent) return b.monthOverMonthPercent - a.monthOverMonthPercent;
      return b.placementRate - a.placementRate;
    }

    if (b.placementRate !== a.placementRate) return b.placementRate - a.placementRate;
    return b.completionRate - a.completionRate;
  });

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-500/10 rounded-2xl">
          <Shield className="h-8 w-8 text-purple-500" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">System Overview</h2>
          <p className="text-muted-foreground">System health and institution governance</p>
        </div>
      </div>

      {/* System Health Summary */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
          <CardContent className="p-4 md:p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-green-100/50 backdrop-blur-sm rounded-2xl inline-block">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl md:text-3xl font-black text-gray-900">Healthy</h3>
              <p className="text-sm font-bold text-gray-400">All services operational</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
          <CardContent className="p-4 md:p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-100/50 backdrop-blur-sm rounded-2xl inline-block">
                <Building2 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl md:text-3xl font-black text-gray-900">{data.totalInstitutions || 0}</h3>
              <p className="text-sm font-bold text-gray-400">Active TVET centers</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 ease-out"></div>
          <CardContent className="p-4 md:p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-100/50 backdrop-blur-sm rounded-2xl inline-block">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl md:text-3xl font-black text-gray-900">{data.totalUsers || 0}</h3>
              <p className="text-sm font-bold text-gray-400">Across all roles</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map Section */}
      <GeolocatedMonitoringMap />

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  Approval Inbox
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  HQ actions waiting on review and recently rejected submissions.
                </CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/semester-reports')}>
                Open Reports
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-green-500">Pending</p>
                <p className="text-3xl font-black text-green-700 mt-2">{data.approvalInbox?.pendingCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-500">Over 7 Days</p>
                <p className="text-3xl font-black text-amber-700 mt-2">{data.approvalInbox?.overdueCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-red-500">Recent Rejections</p>
                <p className="text-3xl font-black text-red-700 mt-2">{data.approvalInbox?.recentRejectedCount || 0}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Waiting for HQ</p>
                <button onClick={() => navigate('/semester-reports')} className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                  Review Queue
                </button>
              </div>
              {data.approvalInbox?.queue?.length ? (
                data.approvalInbox.queue.map((item) => (
                  <div key={item._id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-gray-900">{item.institution}</p>
                        <p className="text-sm font-medium text-gray-500">{item.title}</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-0">{item.ageDays}d waiting</Badge>
                    </div>
                    <p className="text-xs font-bold text-gray-400 mt-2">Submitted {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm font-medium text-gray-500">No reports are currently waiting for HQ review.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <LifeBuoy className="h-6 w-6 text-[#FFB800]" />
                  Support Escalation Queue
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Unresolved tickets that need HQ attention or follow-up.
                </CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/support-center')}>
                Open Support
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-500">Open</p><p className="text-3xl font-black text-amber-700 mt-2">{data.supportSummary?.open || 0}</p></div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-500">In Progress</p><p className="text-3xl font-black text-blue-700 mt-2">{data.supportSummary?.inProgress || 0}</p></div>
              <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-500">Urgent</p><p className="text-3xl font-black text-red-700 mt-2">{data.supportSummary?.urgentOpen || 0}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Oldest Age</p><p className="text-3xl font-black text-slate-700 mt-2">{data.supportSummary?.oldestOpenAgeDays || 0}d</p></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                <p className="text-sm font-black text-gray-900 mb-3">By Category</p>
                <div className="space-y-2">
                  {data.supportSummary?.categoryBreakdown?.length ? data.supportSummary.categoryBreakdown.slice(0, 4).map((item) => (
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
                  {data.supportSummary?.regionBreakdown?.length ? data.supportSummary.regionBreakdown.slice(0, 4).map((item) => (
                    <div key={item.region} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-600">{item.region || 'Unassigned'}</span>
                      <span className="font-black text-gray-900">{item.count}</span>
                    </div>
                  )) : <p className="text-sm text-gray-500">No unresolved tickets.</p>}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {data.supportSummary?.queue?.length ? data.supportSummary.queue.slice(0, 4).map((ticket) => (
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
                  <p className="text-xs font-bold text-gray-400 mt-2">Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })} · {ticket.replyCount} repl{ticket.replyCount === 1 ? 'y' : 'ies'}</p>
                </div>
              )) : <p className="text-sm font-medium text-gray-500">No open support escalations.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Regional Performance League Table</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Placement rate, completion rate, intervention risk, and month-over-month placement movement by region.
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
              onClick={() => setRegionalSortBy("monthOverMonthPercent")}
              className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${regionalSortBy === "monthOverMonthPercent" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              MoM Movement
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-8 pt-2">
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
                        <span>
                          {region.movementDirection === "up" ? "+" : region.movementDirection === "down" ? "" : ""}
                          {region.monthOverMonthPercent}%
                        </span>
                        <span className="text-xs font-bold opacity-70">MoM</span>
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
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Current Month</span>
                        <span className="text-2xl font-black text-gray-900">{region.currentMonthPlacements}</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Previous Month</span>
                        <span className="text-2xl font-black text-gray-900">{region.previousMonthPlacements}</span>
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
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">6-Month Placement Trend</p>
                        <p className="text-xs font-bold text-gray-500">
                          {region.sparkline?.[0]?.month} to {region.sparkline?.[(region.sparkline?.length || 1) - 1]?.month}
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
                      <div className="mt-2 grid grid-cols-6 gap-2">
                        {region.sparkline.map((point) => (
                          <div key={`${region.region}-${point.month}`} className="text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{point.month}</p>
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

      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Calendar & Deadline Risk</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Upcoming national deadlines, overdue submissions, and institutions at risk of missing the current reporting cycle.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/academic-calendar')}>
                Open Calendar
              </Button>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/semester-reports')}>
                Open Reports
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 pt-2 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-blue-500">Upcoming Deadlines</p>
              <p className="text-3xl font-black text-blue-700 mt-2">{data.deadlineRisk?.upcomingDeadlines?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-red-500">Overdue Institutions</p>
              <p className="text-3xl font-black text-red-700 mt-2">{data.deadlineRisk?.overdueInstitutionSubmissions?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-amber-500">At Risk This Cycle</p>
              <p className="text-3xl font-black text-amber-700 mt-2">{data.deadlineRisk?.atRiskInstitutions?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-purple-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-purple-500">Current Cycle</p>
              <p className="text-sm font-black text-purple-700 mt-2">
                {data.deadlineRisk?.currentCycle ? `${data.deadlineRisk.currentCycle.semester} ${data.deadlineRisk.currentCycle.academicYear}` : 'No active cycle'}
              </p>
            </div>
          </div>

          {data.deadlineRisk?.currentCycle && (
            <div className={`rounded-2xl border px-5 py-4 ${data.deadlineRisk.currentCycle.isOverdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-500">Current Reporting Cycle</p>
                  <p className="text-lg font-black text-gray-900 mt-1">{data.deadlineRisk.currentCycle.title}</p>
                  <p className="text-sm font-medium text-gray-600 mt-1">
                    Due {formatDistanceToNow(new Date(data.deadlineRisk.currentCycle.endDate), { addSuffix: true })}
                  </p>
                </div>
                <Badge className={data.deadlineRisk.currentCycle.isOverdue ? 'bg-red-500 text-white border-0' : 'bg-amber-100 text-amber-700 border-0'}>
                  {data.deadlineRisk.currentCycle.isOverdue ? 'Overdue' : `${data.deadlineRisk.currentCycle.daysRemaining} days remaining`}
                </Badge>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
              <p className="text-sm font-black text-gray-900 mb-4">Upcoming National Deadlines</p>
              <div className="space-y-3">
                {data.deadlineRisk?.upcomingDeadlines?.length ? data.deadlineRisk.upcomingDeadlines.map((deadline) => (
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
                {data.deadlineRisk?.overdueInstitutionSubmissions?.length ? data.deadlineRisk.overdueInstitutionSubmissions.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => navigate(`/semester-reports?deadlineView=overdue&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(data.deadlineRisk.currentCycle?.semester || '')}&academicYear=${encodeURIComponent(data.deadlineRisk.currentCycle?.academicYear || '')}`)}
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
                {data.deadlineRisk?.atRiskInstitutions?.length ? data.deadlineRisk.atRiskInstitutions.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => navigate(`/semester-reports?deadlineView=at-risk&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(data.deadlineRisk.currentCycle?.semester || '')}&academicYear=${encodeURIComponent(data.deadlineRisk.currentCycle?.academicYear || '')}`)}
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
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Global User Governance</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Role distribution, inactive accounts, orphaned institutions, and privileged-access anomalies.
              </CardDescription>
            </div>
            <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/users')}>
              Open Users
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-8 pt-2 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button onClick={() => navigate('/users')} className="rounded-2xl bg-blue-50 p-4 text-left hover:bg-blue-100 transition-colors">
              <p className="text-xs font-black uppercase tracking-wider text-blue-500">Roles Tracked</p>
              <p className="text-3xl font-black text-blue-700 mt-2">{data.userGovernance?.roleBreakdown?.length || 0}</p>
            </button>
            <button onClick={() => navigate('/users?status=Inactive')} className="rounded-2xl bg-red-50 p-4 text-left hover:bg-red-100 transition-colors">
              <p className="text-xs font-black uppercase tracking-wider text-red-500">Inactive Users</p>
              <p className="text-3xl font-black text-red-700 mt-2">{data.userGovernance?.inactiveUsers || 0}</p>
            </button>
            <button onClick={() => navigate('/users?governance=password-reset-pending')} className="rounded-2xl bg-amber-50 p-4 text-left hover:bg-amber-100 transition-colors">
              <p className="text-xs font-black uppercase tracking-wider text-amber-500">Password Resets Pending</p>
              <p className="text-3xl font-black text-amber-700 mt-2">{data.userGovernance?.pendingPasswordResets || 0}</p>
            </button>
            <button onClick={() => navigate('/users?governance=orphaned-institutions&role=Admin&status=Active')} className="rounded-2xl bg-purple-50 p-4 text-left hover:bg-purple-100 transition-colors">
              <p className="text-xs font-black uppercase tracking-wider text-purple-500">Orphaned Institutions</p>
              <p className="text-3xl font-black text-purple-700 mt-2">{data.userGovernance?.institutionsWithoutActiveAdmins?.length || 0}</p>
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-black text-gray-900">Users by Role</p>
                <button onClick={() => navigate('/users')} className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                  Manage
                </button>
              </div>
              <div className="space-y-3">
                {data.userGovernance?.roleBreakdown?.length ? data.userGovernance.roleBreakdown.map((item) => (
                  <div key={item.role} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">{item.role}</span>
                    <Badge className="bg-white text-gray-900 border border-gray-200">{item.count}</Badge>
                  </div>
                )) : <p className="text-sm text-gray-500">No user data available.</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-black text-gray-900">Institutions Without Active Admins</p>
                <button onClick={() => navigate('/users?governance=orphaned-institutions&role=Admin&status=Active')} className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                  Assign Admins
                </button>
              </div>
              <div className="space-y-3">
                {data.userGovernance?.institutionsWithoutActiveAdmins?.length ? data.userGovernance.institutionsWithoutActiveAdmins.map((institution) => (
                  <div key={institution._id} className="rounded-xl bg-white border border-gray-100 p-3">
                    <p className="font-bold text-gray-900 text-sm">{institution.name}</p>
                    <p className="text-xs font-medium text-gray-500 mt-1">{institution.region} · {institution.code}</p>
                  </div>
                )) : <p className="text-sm text-gray-500">Every institution currently has an active admin.</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-black text-gray-900">Privileged Access Anomalies</p>
                <button onClick={() => navigate('/users?governance=privileged-anomalies')} className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                  Review Access
                </button>
              </div>
              <div className="space-y-3">
                {data.userGovernance?.privilegedUserAnomalies?.length ? data.userGovernance.privilegedUserAnomalies.map((entry) => (
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
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  Audit & Compliance Snapshot
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Sensitive platform activity from the last 7 days.
                </CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/activity-log')}>
                Open Audit Log
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Events</p><p className="text-3xl font-black text-slate-700 mt-2">{data.auditSummary?.eventsLast7Days || 0}</p></div>
              <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-500">Deletes</p><p className="text-3xl font-black text-red-700 mt-2">{data.auditSummary?.destructiveEventsLast7Days || 0}</p></div>
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-500">Status Changes</p><p className="text-3xl font-black text-amber-700 mt-2">{data.auditSummary?.statusChangesLast7Days || 0}</p></div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-500">Auth Events</p><p className="text-3xl font-black text-blue-700 mt-2">{data.auditSummary?.authEventsLast7Days || 0}</p></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
                <p className="text-sm font-black text-gray-900 mb-3">Top Actors</p>
                <div className="space-y-3">
                  {data.auditSummary?.topActors?.length ? data.auditSummary.topActors.map((actor) => (
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
                  {data.auditSummary?.recentSensitiveEvents?.length ? data.auditSummary.recentSensitiveEvents.slice(0, 4).map((event) => (
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
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                  Data Quality Alerts
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Operational gaps likely to affect compliance, reporting, or follow-up.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-4">
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

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {/* Registered Institutions Management */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col h-[700px]">
          <CardHeader className="p-8 pb-4 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">School Governance</CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Add and manage registered TVET institutions
                </CardDescription>
              </div>
              <Button 
                onClick={() => { setEditingInstitution(null); setInstOpen(true); }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl"
              >
                Register School
              </Button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-purple-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-purple-700">{data.institutionDetails?.length || 0}</div>
                <div className="text-xs font-bold text-purple-400 mt-1">Total Institutions</div>
              </div>
              <div className="bg-blue-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-blue-700">
                  {(() => {
                    const regions = new Set(data.institutionDetails?.map((i: any) => i.region));
                    return regions.size;
                  })()}
                </div>
                <div className="text-xs font-bold text-blue-400 mt-1">Regions Covered</div>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-amber-700">
                  {(() => {
                    const allProgs = new Set(data.institutionDetails?.flatMap((i: any) => i.programs || []));
                    return allProgs.size;
                  })()}
                </div>
                <div className="text-xs font-bold text-amber-400 mt-1">Unique Programs</div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mt-4">
              <input
                type="text"
                placeholder="Search by institution name, code, or region..."
                value={instSearch}
                onChange={(e) => setInstSearch(e.target.value)}
                className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all"
              />
              {instSearch && (
                <button onClick={() => setInstSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold">
                  Clear
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-4 flex-1 overflow-hidden flex flex-col">
            {(() => {
              const filtered = (data.institutionDetails || []).filter((inst: any) => {
                if (!instSearch) return true;
                const q = instSearch.toLowerCase();
                return inst.name?.toLowerCase().includes(q) || inst.code?.includes(q) || inst.region?.toLowerCase().includes(q);
              });

              // Group by region
              const byRegion: Record<string, any[]> = {};
              filtered.forEach((inst: any) => {
                const r = inst.region || 'Unknown';
                if (!byRegion[r]) byRegion[r] = [];
                byRegion[r].push(inst);
              });

              const regionKeys = Object.keys(byRegion).sort();

              if (filtered.length === 0) {
                return <p className="text-center text-gray-400 py-6 overflow-y-auto">No institutions found.</p>;
              }

              return (
                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                  {regionKeys.map(region => {
                    const institutions = byRegion[region];
                    const isExpanded = expandedRegions.includes(region);
                    const displayInst = isExpanded ? institutions : institutions.slice(0, 6);

                    return (
                      <div key={region} className="border border-gray-100 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setExpandedRegions(prev => 
                            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
                          )}
                          className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-purple-100 rounded-lg">
                              <Building2 className="h-3.5 w-3.5 text-purple-600" />
                            </div>
                            <span className="font-black text-sm text-gray-800">{region}</span>
                            <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px] font-black px-2">
                              {institutions.length}
                            </Badge>
                          </div>
                          <span className="text-gray-400 text-xs font-bold">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {displayInst.map((inst: any) => (
                            <div
                              key={inst._id}
                              onClick={() => { setEditingInstitution(inst); setInstOpen(true); }}
                              className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-purple-200 hover:shadow-md transition-all cursor-pointer group"
                            >
                              <div className="p-2 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors shrink-0">
                                <Building2 className="h-4 w-4 text-purple-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-gray-800 truncate leading-tight">{inst.name}</p>
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono font-bold">{inst.code}</span>
                                  {inst.programs?.length > 0 && (
                                    <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold">{inst.programs.length} prog</span>
                                  )}
                                  <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-bold">{inst.gender || 'Mixed'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {institutions.length > 6 && !isExpanded && (
                          <button
                            onClick={() => setExpandedRegions(prev => [...prev, region])}
                            className="w-full py-2 text-xs font-bold text-purple-500 hover:text-purple-700 hover:bg-purple-50 transition-colors border-t border-gray-100"
                          >
                            Show {institutions.length - 6} more...
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <Dialog open={instOpen} onOpenChange={setInstOpen}>
                <DialogContent className="sm:max-w-[600px] rounded-[2rem] border-0 shadow-2xl p-0 overflow-hidden">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-500/10 rounded-2xl">
                                    <Building2 className="h-6 w-6 text-purple-500" />
                                </div>
                                <div>
                                    <DialogTitle className="text-2xl font-black">{editingInstitution ? 'Edit Institution' : 'Register New Institution'}</DialogTitle>
                                    <DialogDescription className="font-bold text-gray-400">
                                        Configure school metadata and classification.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <InstitutionForm 
                          onSuccess={() => {
                            setInstOpen(false);
                            setRefreshKey(prev => prev + 1);
                            toast.success(editingInstitution ? "Institution updated" : "Institution registered");
                          }} 
                          initialData={editingInstitution}
                        />
                    </div>
                </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Industry Partners Management */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col h-[700px]">
          <CardHeader className="p-8 pb-4 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">Industry Partners</CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Companies active in the placement network
                </CardDescription>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-amber-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-amber-700">{data.totalPartners || 0}</div>
                <div className="text-xs font-bold text-amber-400 mt-1">Total Companies</div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-700">
                  {data.partnersDetails?.reduce((sum, p) => sum + (p.totalSlots || 0), 0) || 0}
                </div>
                <div className="text-xs font-bold text-emerald-400 mt-1">Total Capacity Slots</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-4 flex-1 overflow-hidden flex flex-col">
            {(!data.partnersDetails || data.partnersDetails.length === 0) ? (
              <p className="text-center text-gray-400 py-6">No industry partners found.</p>
            ) : (
              <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                {data.partnersDetails.map((partner: any) => (
                  <div key={partner._id} className="flex items-start gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-amber-200 hover:shadow-md transition-all">
                    <div className="p-2 bg-amber-50 rounded-xl shrink-0">
                      <Briefcase className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-gray-800 truncate leading-tight">{partner.name}</p>
                        <Badge className={`${partner.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0 text-[10px] px-2`}>
                          {partner.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">{partner.sector}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">{partner.region}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs font-bold">
                        <span className="text-gray-400">Capacity</span>
                        <span className="text-gray-900">{partner.usedSlots || 0} / {partner.totalSlots || 0} slots</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                        <div 
                          className="bg-amber-400 h-1 rounded-full transition-all duration-500" 
                          style={{ width: `${partner.totalSlots > 0 ? Math.min(((partner.usedSlots || 0) / partner.totalSlots) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Institution Breakdown */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-black">Institution Breakdown</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Learner distribution and placement rates per institution
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => downloadCSV(data.institutionStats, 'institutional-breakdown')}
                className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => downloadPDF(data.institutionStats, 'institutional-breakdown')}
                className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
              >
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          {data.institutionStats.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No institution data yet. Users must register and create learners.</p>
          ) : (
            <div className="space-y-4">
              {data.institutionStats.map((inst) => {
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
                        <h3 className="text-lg font-black text-gray-900">{inst._id || 'Unknown'}</h3>
                      </div>
                      <Badge className="bg-[#FFB800] text-gray-900 border-0 font-black">
                        {placementRate}% placed
                      </Badge>
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
                    {/* Progress bar */}
                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-[#FFB800] h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${placementRate}%` }}
                      />
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
