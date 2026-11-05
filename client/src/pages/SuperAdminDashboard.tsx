import { UserGovernanceCards, type UserGovernanceData } from '@/components/dashboard/UserGovernanceCards';
import { HQActionQueue, type ActionCentrePage, type HqActionCategory } from '@/components/dashboard/HQActionQueue';
import { withActionReturn } from '@/lib/hqActionNavigation';
import { encodeCsv } from '@/lib/csv';
import { overviewExportTable } from '@/lib/hqOverviewExport';
import './hq-overview.css';
import { LearnerOversight, type LearnerOversightData } from '@/components/dashboard/LearnerOversight';
import { ReportApprovalPipeline } from '@/components/dashboard/ReportApprovalPipeline';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
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
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"
import { Shield, Users, Building2, Download, Briefcase, FileText, AlertTriangle, CheckCircle2, LifeBuoy, ShieldCheck, ArrowRight, TrendingUp, TrendingDown, Minus, RefreshCw, Bell, Upload } from "lucide-react"
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { InstitutionForm, type InstitutionFormValues } from "./InstitutionForm"
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
import { toast } from "@/lib/toast"
import { useNavigate, useSearchParams } from "react-router-dom"
import { getHQScopeLabel, hasHQPermission } from "@/lib/rbac"

interface InstitutionStat {
  _id: string;
  totalLearners: number;
  placed: number;
  pending: number;
  completed: number;
  dropped: number;
}

interface InstitutionDetail extends Partial<InstitutionFormValues> {
  _id: string;
  name: string;
  code: string;
  region: string;
  programs?: string[];
}

interface InstitutionImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: Array<{ row: number; reason: string }>;
  failedRow?: number;
  message?: string;
}

interface PartnerDetail {
  _id: string;
  name: string;
  status: string;
  sector?: string;
  region?: string;
  contactPerson?: string;
  totalSlots?: number;
  usedSlots?: number;
}

interface RegionalStat {
  region: string;
  totalLearners: number;
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

type HqDashboardView = "learners" | "operations" | "performance" | "governance" | "registries";

const GENDER_CHART_COLORS = ['#4f46e5', '#ec4899', '#8b5cf6', '#6b7280'];
const PROGRAM_CHART_COLORS = ['#FFB800', '#4f46e5', '#10b981', '#ec4899', '#f97316', '#8b5cf6', '#06b6d4'];
const INSTITUTION_BREAKDOWN_PAGE_SIZE = 8;

interface OverviewData extends LearnerOversightData {
  generatedAt?: string;
  actionCentre?: ActionCentrePage;
  reportPipeline?: { status: string; count: number }[];
  totalUsers: number;
  totalLearners: number;
  totalPlacements: number;
  totalVisits: number;
  totalReports: number;
  totalInstitutions: number;
  totalPartners: number;
  institutions: string[];
  institutionDetails: InstitutionDetail[];
  partnersDetails: PartnerDetail[];
  institutionStats: InstitutionStat[];
  regionalStats: RegionalStat[];
  genderDistribution: { gender: string; count: number }[];
  programDistribution: { program: string; count: number }[];
  approvalInbox: {
    pendingCount: number;
    overdueCount: number;
    recentRejectedCount: number;
    queue: { _id: string; institution: string; title: string; status: string; createdAt: string; ageDays: number | null; reviewStartedAt?: string }[];
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
      assignedTo?: { _id: string; name: string; role: string } | null;
      escalatedTo?: { _id: string; name: string; role: string } | null;
      escalationLevel?: string;
      firstResponseDueAt?: string | null;
      resolutionDueAt?: string | null;
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
  userGovernance: UserGovernanceData;
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
      deadlineId: string; semester: string; academicYear: string; yearGroup: string; endDate: string; title: string;
    }[];
    atRiskInstitutions: {
      _id: string;
      institution: string;
      region: string;
      status: string;
      code: string;
      deadlineId: string; semester: string; academicYear: string; yearGroup: string; endDate: string; title: string;
      daysRemaining: number;
    }[];
  };
}

const formatSemesterPeriod = (period = '') => {
  const match = period.match(/^S([12])\s+(\d{4})$/);
  if (!match) return period;
  return `Semester ${match[1]}, ${match[2]}`;
};

export default function SuperAdminDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasData = useRef(false);
  const lastRefreshKey = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [instOpen, setInstOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<InstitutionDetail | null>(null);
  const [instSearch, setInstSearch] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [institutionBreakdownPage, setInstitutionBreakdownPage] = useState(1);
  const [csvImporting, setCsvImporting] = useState(false);
  const [institutionImportResult, setInstitutionImportResult] = useState<InstitutionImportResult | null>(null);
  const [notifyingDeadlineKeys, setNotifyingDeadlineKeys] = useState<string[]>([]);
  const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
  const [regionalSortBy, setRegionalSortBy] = useState<"placementRate" | "completionRate" | "semesterOverSemesterPercent">("placementRate");
  const { authFetch, user } = useAuth();
  const viewerKey = JSON.stringify([user?._id, user?.role, user?.hqScopeType, user?.institution, user?.region]);
  const previousViewerKey = useRef(viewerKey);
  const [dataViewerKey, setDataViewerKey] = useState('');
  const canManageUsers = hasHQPermission(user?.role, 'users:manage');
  const canManageSystem = hasHQPermission(user?.role, 'system:manage');
  const canNotifyInstitutions = canManageSystem;
  const scopeLabel = user?.role === 'SuperAdmin' ? 'National Administration' : getHQScopeLabel(user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDashboardView = searchParams.get("view");
  const actionFilter = searchParams.get('actionCategory') || 'All';
  const actionPage = searchParams.get('actionPage') || '1';
  const changeActionPage = (page: number, category = actionFilter) => {
    const next = new URLSearchParams(searchParams);
    if (category === 'All') next.delete('actionCategory'); else next.set('actionCategory', category);
    if (page <= 1) next.delete('actionPage'); else next.set('actionPage', String(page));
    setSearchParams(next, { replace: true });
  };
  const openHqAction = (target: string) => navigate(withActionReturn(target, `/system-overview?${searchParams}`));

  const dashboardView: HqDashboardView = requestedDashboardView === "learners" || requestedDashboardView === "performance" || requestedDashboardView === "governance" || requestedDashboardView === "registries"
    ? requestedDashboardView
    : "operations";

  useEffect(() => {
    const controller = new AbortController();
    if (previousViewerKey.current !== viewerKey) {
      previousViewerKey.current = viewerKey;
      hasData.current = false;
      setData(null);
      setInstOpen(false);
      setEditingInstitution(null);
      setLastRefreshedAt(null);
    }
    const force = refreshKey !== lastRefreshKey.current;
    lastRefreshKey.current = refreshKey;
    setLoading(!hasData.current);
    setRefreshing(true);
    setLoadError('');
    const params = new URLSearchParams({ actionCategory: actionFilter, actionPage });
    if (force) params.set('refresh', 'true');
    void (async () => {
      try {
        const response = await authFetch(`/api/admin/overview?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || `Server returned ${response.status}`);
        if (controller.signal.aborted) return;
        setData(payload);
        setDataViewerKey(viewerKey);
        hasData.current = true;
        setLastRefreshedAt(payload.generatedAt ? new Date(payload.generatedAt) : new Date());
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh overview');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => controller.abort();
  }, [authFetch, refreshKey, actionFilter, actionPage, viewerKey]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleInstitutionCsvImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setCsvImporting(true);
    setInstitutionImportResult(null);
    try {
      const csv = await file.text();
      const response = await authFetch('/api/institutions/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const result = await response.json().catch(() => ({})) as InstitutionImportResult;
      if (!response.ok) throw new Error(result.message || 'Failed to import institutions');
      setInstitutionImportResult(result);
      if (result.failedRow) {
        toast.error(`Import stopped at row ${result.failedRow}; ${result.createdCount} institutions were retained`);
      } else if (result.skippedCount) {
        toast.warning(`Imported ${result.createdCount} institutions; ${result.skippedCount} rows skipped. Review details below.`);
      } else {
        toast.success(`Imported ${result.createdCount} institutions`);
      }
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error importing institutions CSV:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to import institutions');
    } finally {
      setCsvImporting(false);
    }
  };

  const notifyDeadlineInstitution = async (
    item: { _id: string; institution: string; deadlineId: string; semester: string; academicYear: string; title: string },
    riskType: 'overdue' | 'at-risk'
  ) => {
    const notifyKey = `${riskType}:${item._id}`;
    setNotifyingDeadlineKeys((current) => [...current, notifyKey]);
    try {
      const response = await authFetch('/api/admin/deadline-risk/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution: item.institution,
          riskType,
          semester: item.semester,
          academicYear: item.academicYear,
          deadlineId: item.deadlineId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Failed to notify institution admins');
      if (result.notifiedCount) toast.success(`Created ${result.notifiedCount} administrator reminder${result.notifiedCount === 1 ? '' : 's'}`);
      else toast.warning('No new reminders created. Recipients may already have been notified or have disabled these notifications.');
    } catch (error) {
      console.error('Error notifying institution admins:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to notify institution admins');
    } finally {
      setNotifyingDeadlineKeys((current) => current.filter((key) => key !== notifyKey));
    }
  };

  const institutionRegionCount = useMemo(() => {
    return new Set((data?.institutionDetails || []).map((institution) => institution.region).filter(Boolean)).size;
  }, [data?.institutionDetails]);

  const uniqueProgramCount = useMemo(() => {
    return new Set((data?.institutionDetails || []).flatMap((institution) => institution.programs || [])).size;
  }, [data?.institutionDetails]);

  const downloadCSV = <T extends object>(dataset: T[], filename: string) => {
    if (!dataset.length) return;
    const table = overviewExportTable(dataset, filename);
    const csv = encodeCsv([table.headers, ...table.values]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPDF = async <T extends object>(dataset: T[], filename: string) => {
    if (!dataset.length) return;
    const doc = new jsPDF();
    
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
    
    const table = overviewExportTable(dataset, filename);
    const headers = table.headers;
    const rows = table.values.map(row => row.map(value => String(value ?? '')));

    autoTable(doc, {
      startY: 40,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] }
    });
    
    doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if ((loading && !data) || (data && dataViewerKey !== viewerKey)) {
    return (
      <div className="hq-overview flex-1 space-y-5 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-[2rem]" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[520px] rounded-[2rem]" />
          <Skeleton className="h-[520px] rounded-[2rem]" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div>
          <p className="text-red-600 font-bold">Failed to load overview data.</p>
          {loadError && <p className="text-sm text-gray-500 mt-1">{loadError}</p>}
        </div>
        <Button className="rounded-xl" onClick={() => setRefreshKey((prev) => prev + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  const qualityAlertItems = [
    {
      label: "Pending learners older than 14 days",
      count: data.dataQualityAlerts?.stalePendingLearners || 0,
      tone: "text-amber-700 bg-amber-50",
      target: "/learners?exception=stale-pending",
    },
    {
      label: "Active placements missing supervisor details",
      count: data.dataQualityAlerts?.placementsMissingSupervisor || 0,
      tone: "text-red-700 bg-red-50",
      target: "/placements?exception=missing-supervisor&status=Active",
    },
    {
      label: "Attendance logs pending sign-off for 3+ days",
      count: data.dataQualityAlerts?.pendingAttendanceSignOff || 0,
      tone: "text-indigo-700 bg-indigo-50",
      target: "/attendance-logs?exception=unsigned-overdue&status=Pending",
    },
    {
      label: "Active placements without monitoring visits",
      count: data.dataQualityAlerts?.activePlacementsWithoutVisits || 0,
      tone: "text-orange-700 bg-orange-50",
      target: "/monitoring-visits?view=exceptions&exception=unvisited-placement",
    },
  ];
  const dataQualityAlertTotal = qualityAlertItems.reduce((sum, alert) => sum + alert.count, 0);
  const orphanedInstitutionCount = data.userGovernance?.institutionsWithoutActiveAdmins?.length || 0;
  const overdueReportCount = data.approvalInbox?.overdueCount || 0;
  const urgentSupportCount = data.supportSummary?.urgentOpen || 0;
  const overdueDeadlineCount = (data.deadlineRisk?.overdueInstitutionSubmissions?.length || 0);
  const pendingApprovalCount = data.approvalInbox?.pendingCount || 0;
  const notificationCount = pendingApprovalCount + urgentSupportCount + overdueDeadlineCount;
  const healthScore = Math.max(0, 100
    - Math.min(40, urgentSupportCount * 25)
    - Math.min(25, overdueReportCount * 15)
    - Math.min(25, Math.ceil(dataQualityAlertTotal / 5))
    - Math.min(20, orphanedInstitutionCount * 3));
  const healthState = healthScore >= 85 ? "green" : healthScore >= 60 ? "amber" : "red";
  const healthLabel = healthState === "green" ? "Low operational risk" : healthState === "amber" ? "Needs Attention" : "Critical";
  const healthTone = healthState === "green"
    ? {
        icon: "bg-emerald-100 text-emerald-700",
        badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
        score: "text-emerald-700",
        bar: "bg-emerald-500",
      }
    : healthState === "amber"
      ? {
          icon: "bg-amber-100 text-amber-700",
          badge: "bg-amber-100 text-amber-700 border-amber-200",
          score: "text-amber-700",
          bar: "bg-amber-500",
        }
      : {
          icon: "bg-red-100 text-red-700",
          badge: "bg-red-100 text-red-700 border-red-200",
          score: "text-red-700",
          bar: "bg-red-500",
        };

  const sortedRegionalStats = [...(data.regionalStats || [])].sort((a, b) => {
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
  const filteredPartners = (data.partnersDetails || []).filter((partner) => {
    if (!partnerSearch.trim()) return true;
    const q = partnerSearch.trim().toLowerCase();
    return (
      partner.name?.toLowerCase().includes(q) ||
      partner.sector?.toLowerCase().includes(q) ||
      partner.region?.toLowerCase().includes(q) ||
      partner.contactPerson?.toLowerCase().includes(q)
    );
  });
  const institutionBreakdownTotalPages = Math.max(1, Math.ceil((data.institutionStats?.length || 0) / INSTITUTION_BREAKDOWN_PAGE_SIZE));
  const currentInstitutionBreakdownPage = Math.min(institutionBreakdownPage, institutionBreakdownTotalPages);
  const institutionBreakdownStartIndex = (currentInstitutionBreakdownPage - 1) * INSTITUTION_BREAKDOWN_PAGE_SIZE;
  const visibleInstitutionStats = (data.institutionStats || []).slice(
    institutionBreakdownStartIndex,
    institutionBreakdownStartIndex + INSTITUTION_BREAKDOWN_PAGE_SIZE,
  );

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 rounded-2xl">
            <Shield className="h-8 w-8 text-purple-500" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">HQ Action Centre</h2>
            <p className="text-muted-foreground">Operational oversight and institution governance · {scopeLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastRefreshedAt && (
            <span className="text-xs font-bold text-gray-500">
              Last refreshed: {formatDistanceToNow(lastRefreshedAt, { addSuffix: true })}
            </span>
          )}
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="relative">
              <Bell className="h-5 w-5 text-gray-700" />
              {notificationCount > 0 && (
                <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-black leading-5 text-white">
                  {notificationCount}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
              <span>{pendingApprovalCount} approvals</span>
              <span className="text-gray-300">|</span>
              <span>{urgentSupportCount} urgent</span>
              <span className="text-gray-300">|</span>
              <span>{overdueDeadlineCount} overdue</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-xl border-gray-200 font-bold"
            disabled={refreshing}
            onClick={() => setRefreshKey((prev) => prev + 1)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>


      <div className="hq-workspaces rounded-2xl border border-gray-200 bg-white p-2 shadow-sm" role="group" aria-label="HQ dashboard workspace">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          {([
            { value: "operations", label: "Operational Queues", description: "Approvals and escalations" },
            { value: "learners", label: "Learner Oversight", description: "Progress, attendance and outcomes" },
            { value: "performance", label: "Performance & Risk", description: "Health, deadlines and analytics" },
            { value: "governance", label: "Governance & Compliance", description: "Users, audit and data quality" },
            { value: "registries", label: "Registries", description: "Institutions and partners" },
          ] as const).map((view) => (
            <button
              key={view.value}
              type="button"
              aria-pressed={dashboardView === view.value}
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("view", view.value);
                setSearchParams(nextParams, { replace: true });
              }}
              className={`rounded-xl px-4 py-3 text-left transition-colors ${dashboardView === view.value ? 'bg-gray-950 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="block text-sm font-black">{view.label}</span>
              <span className={`mt-0.5 hidden text-[11px] font-medium sm:block ${dashboardView === view.value ? 'text-gray-300' : 'text-gray-400'}`}>{view.description}</span>
            </button>
          ))}
        </div>
      </div>

      {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>Refresh failed. Showing the last successful snapshot. {loadError}</span><Button variant="outline" size="sm" onClick={() => setRefreshKey(value => value + 1)}>Retry refresh</Button></div> : null}
      {dashboardView === 'operations' ? <HQActionQueue queue={data.actionCentre} category={actionFilter} busy={refreshing} onFilter={(category: HqActionCategory) => changeActionPage(1, category)} onPage={page => changeActionPage(page)} onOpen={openHqAction} /> : null}

      {/* System Health Summary */}
      {dashboardView === "learners" ? <LearnerOversight
        adminData={data}
        adminScopeLabel={scopeLabel || 'National Oversight'}
        openLearnerRegister={(params) => navigate(`/learners?${new URLSearchParams(params)}`)}
        openInterventionQueue={(params) => navigate(`/learner-progress?${new URLSearchParams(params)}`)}
      /> : null}
      {dashboardView === "operations" ? <ReportApprovalPipeline reports={data.reportPipeline} /> : null}

      <div className={`${dashboardView === "performance" ? "grid" : "hidden"} gap-6 md:grid-cols-3`}>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300">
          <CardContent className="p-4 md:p-6">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl inline-block ${healthTone.icon}`}>
                <Shield className="h-6 w-6" />
              </div>
              <Badge className={`${healthTone.badge} font-black`}>{healthLabel}</Badge>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className={`text-2xl md:text-3xl font-black ${healthTone.score}`}>{healthScore}/100</h3>
                <p className="text-sm font-bold text-gray-600">Operational risk score</p><p className="mt-1 text-xs text-gray-600">Based on urgent tickets, overdue reviews, data exceptions and administrator coverage.</p>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div className={`h-2 rounded-full ${healthTone.bar}`} style={{ width: `${healthScore}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-gray-500">
                <span>{urgentSupportCount} urgent tickets</span>
                <span>{overdueReportCount} overdue reports</span>
                <span>{dataQualityAlertTotal} quality alerts</span>
                <span>{orphanedInstitutionCount} orphaned schools</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300">
          <CardContent className="p-4 md:p-6">
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

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-lg hover:shadow-xl transition-transform duration-300">
          <CardContent className="p-4 md:p-6">
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
      {dashboardView === "performance" ? <GeolocatedMonitoringMap /> : null}

      <div className={`${dashboardView === "performance" ? "grid" : "hidden"} gap-6 grid-cols-1 lg:grid-cols-2`}>
        <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
          <CardHeader className="p-4 pb-0 md:p-8 md:pb-0">
            <CardTitle className="text-xl font-black">Gender Distribution</CardTitle>
            <CardDescription className="mt-1 text-sm font-bold text-gray-400">
              National learner gender breakdown
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-8">
            {data.genderDistribution?.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.genderDistribution}
                      dataKey="count"
                      nameKey="gender"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={88}
                      strokeWidth={2}
                    >
                      {data.genderDistribution.map((entry, index) => (
                        <Cell key={entry.gender} fill={GENDER_CHART_COLORS[index % GENDER_CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap justify-center gap-3" aria-label="Gender distribution totals">
                  {data.genderDistribution.map((entry, index) => (
                    <div key={entry.gender} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: GENDER_CHART_COLORS[index % GENDER_CHART_COLORS.length] }} />
                      <span className="text-sm font-bold text-gray-700">{entry.gender}: {entry.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-gray-400">No gender data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-gray-100 bg-white shadow-xl">
          <CardHeader className="p-4 pb-0 md:p-8 md:pb-0">
            <CardTitle className="text-xl font-black">Trade/Program Distribution</CardTitle>
            <CardDescription className="mt-1 text-sm font-bold text-gray-400">
              National learners across the ten most represented programs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-8">
            {data.programDistribution?.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.programDistribution}
                      dataKey="count"
                      nameKey="program"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={96}
                      paddingAngle={2}
                      strokeWidth={2}
                    >
                      {data.programDistribution.map((entry, index) => (
                        <Cell key={entry.program} fill={PROGRAM_CHART_COLORS[index % PROGRAM_CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [value, 'Learners']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap justify-center gap-3" aria-label="Program distribution totals">
                  {data.programDistribution.map((entry, index) => (
                    <div key={entry.program} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PROGRAM_CHART_COLORS[index % PROGRAM_CHART_COLORS.length] }} />
                      <span className="text-sm font-bold text-gray-700">{entry.program}: {entry.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-gray-400">No program data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`${dashboardView === "operations" ? "grid" : "hidden"} gap-6 grid-cols-1 xl:grid-cols-2`}>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
                  Approval Inbox
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-600 mt-2">
                  HQ actions waiting on review and recently rejected submissions.
                </CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => openHqAction('/semester-reports')}>
                Open Reports
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-green-700">Pending</p>
                <p className="text-3xl font-black text-green-700 mt-2">{data.approvalInbox?.pendingCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Over 7 Days</p>
                <p className="text-3xl font-black text-amber-700 mt-2">{data.approvalInbox?.overdueCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-red-700">Recent Rejections</p>
                <p className="text-3xl font-black text-red-700 mt-2">{data.approvalInbox?.recentRejectedCount || 0}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Waiting for HQ</p>
                <button onClick={() => openHqAction('/semester-reports')} className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                  Review Queue
                </button>
              </div>
              {data.approvalInbox?.queue?.length ? (
                data.approvalInbox.queue.slice(0, 6).map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => openHqAction(`/semester-reports/${item._id}`)}
                    className="group w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
                    aria-label={`Review ${item.title} report from ${item.institution}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-gray-900">{item.institution}</p>
                        <p className="text-sm font-medium text-gray-500">{item.title}</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-0">{item.ageDays === null ? "Entry time unknown" : `${item.ageDays}d in review`}</Badge>
                    </div>
                    <p className="mt-2 flex items-center justify-between text-xs font-bold text-gray-600">
                      <span>Review entry: {item.reviewStartedAt ? formatDistanceToNow(new Date(item.reviewStartedAt), { addSuffix: true }) : "not recorded"}</span>
                      <span className="flex items-center gap-1 text-indigo-600">Review report <ArrowRight className="h-3.5 w-3.5 " /></span>
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm font-medium text-gray-500">No reports are currently waiting for HQ review.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <LifeBuoy className="h-6 w-6 shrink-0 text-[#FFB800]" />
                  Support Escalation Queue
                </CardTitle>
                <CardDescription className="text-base font-bold text-gray-600 mt-2">
                  Unresolved tickets that need HQ attention or follow-up.
                </CardDescription>
              </div>
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => openHqAction('/support-center')}>
                Open Support
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-2 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-700">Open</p><p className="text-3xl font-black text-amber-700 mt-2">{data.supportSummary?.open || 0}</p></div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-blue-700">In Progress</p><p className="text-3xl font-black text-blue-700 mt-2">{data.supportSummary?.inProgress || 0}</p></div>
              <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-700">Urgent</p><p className="text-3xl font-black text-red-700 mt-2">{data.supportSummary?.urgentOpen || 0}</p></div>
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
                <button
                  key={ticket._id}
                  type="button"
                  onClick={() => openHqAction(`/support-center?ticket=${ticket._id}`)}
                  className="group w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
                  aria-label={`Open support ticket ${ticket.subject}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-gray-900">{ticket.subject}</p>
                      <p className="text-sm font-medium text-gray-500">{ticket.institution} · {ticket.requesterName}</p>
                    </div>
                    <Badge className={ticket.priority === 'Urgent' ? 'bg-red-500 text-white border-0' : ticket.priority === 'High' ? 'bg-orange-100 text-orange-700 border-0' : 'bg-slate-100 text-slate-700 border-0'}>
                      {ticket.priority}
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-gray-600">
                    <span>Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })} · {ticket.replyCount} repl{ticket.replyCount === 1 ? 'y' : 'ies'}</span>
                    <span className="flex items-center gap-1 text-indigo-600">Open ticket <ArrowRight className="h-3.5 w-3.5 " /></span>
                  </p>
                </button>
              )) : <p className="text-sm font-medium text-gray-500">No open support escalations.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={`${dashboardView === "performance" ? "block" : "hidden"} bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden`}>
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Regional Performance League Table</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Placement rate, completion rate, intervention risk, and semester-on-semester placement movement by region.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Export regional performance to CSV"
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
                          {region.semesterOverSemesterPercent}%
                        </span>
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
                              labelFormatter={(label) => formatSemesterPeriod(String(label))}
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

      <Card className={`${dashboardView === "performance" ? "block" : "hidden"} bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden`}>
        <CardHeader className="p-8 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl font-black">Calendar & Deadline Risk</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Upcoming national deadlines, overdue submissions, and institutions at risk of missing the current reporting cycle.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {canManageSystem ? <Button variant="outline" className="w-full rounded-xl border-gray-200 font-bold sm:w-auto" onClick={() => navigate('/academic-calendar')}>
                Open Calendar
              </Button> : null}
              <Button variant="outline" className="w-full rounded-xl border-gray-200 font-bold sm:w-auto" onClick={() => navigate('/semester-reports')}>
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
              <p className="text-xs font-black uppercase tracking-wider text-amber-500">Upcoming at Risk</p>
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
                  <div
                    key={item._id}
                    className="rounded-xl bg-white border border-gray-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.institution}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">{item.region} · {item.code} · {item.semester} {item.academicYear} · {item.yearGroup}</p>
                      </div>
                      <Badge className="bg-red-100 text-red-700 border-0">{item.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg border-gray-200 text-xs font-bold"
                        onClick={() => openHqAction(`/semester-reports?deadlineView=overdue&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(item.semester)}&academicYear=${encodeURIComponent(item.academicYear)}&yearGroup=${encodeURIComponent(item.yearGroup)}&deadlineId=${encodeURIComponent(item.deadlineId)}`)}
                      >
                        Open
                      </Button>
                      {canNotifyInstitutions ? <Button
                        size="sm"
                        className="h-8 rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-700"
                        disabled={notifyingDeadlineKeys.includes(`overdue:${item._id}`)}
                        onClick={() => notifyDeadlineInstitution(item, 'overdue')}
                      >
                        {notifyingDeadlineKeys.includes(`overdue:${item._id}`) ? 'Notifying...' : 'Notify'}
                      </Button> : null}
                    </div>
                  </div>
                )) : <p className="text-sm text-gray-500">No overdue institution submissions.</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
              <p className="text-sm font-black text-gray-900 mb-4">Upcoming Submissions at Risk</p>
              <div className="space-y-3">
                {data.deadlineRisk?.atRiskInstitutions?.length ? data.deadlineRisk.atRiskInstitutions.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-xl bg-white border border-gray-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.institution}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">{item.region} · {item.code} · {item.semester} {item.academicYear} · {item.yearGroup}</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-0">{item.daysRemaining}d left</Badge>
                    </div>
                    <p className="text-xs font-medium text-gray-500 mt-2">Current report state: {item.status}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg border-gray-200 text-xs font-bold"
                        onClick={() => openHqAction(`/semester-reports?deadlineView=at-risk&institution=${encodeURIComponent(item.institution)}&semester=${encodeURIComponent(item.semester)}&academicYear=${encodeURIComponent(item.academicYear)}&yearGroup=${encodeURIComponent(item.yearGroup)}&deadlineId=${encodeURIComponent(item.deadlineId)}`)}
                      >
                        Open
                      </Button>
                      {canNotifyInstitutions ? <Button
                        size="sm"
                        className="h-8 rounded-lg bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
                        disabled={notifyingDeadlineKeys.includes(`at-risk:${item._id}`)}
                        onClick={() => notifyDeadlineInstitution(item, 'at-risk')}
                      >
                        {notifyingDeadlineKeys.includes(`at-risk:${item._id}`) ? 'Notifying...' : 'Notify'}
                      </Button> : null}
                    </div>
                  </div>
                )) : <p className="text-sm text-gray-500">No institutions currently flagged as at risk.</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={`${dashboardView === "governance" ? "block" : "hidden"} bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden`}>
        <CardHeader className="p-4 pb-4 sm:p-8 sm:pb-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl font-black">{user?.role === 'SuperAdmin' ? 'Global User Governance' : 'User Governance Snapshot'}</CardTitle>
              <CardDescription className="text-sm font-medium text-slate-600 mt-2">
                Understand account access. Close coverage gaps. Review exceptions.
              </CardDescription>
            </div>
            {canManageUsers ? <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/users')}>
              Open Users
            </Button> : <Badge className="border border-slate-200 bg-slate-50 text-slate-600">View only</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-8 sm:pt-2 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button disabled={!canManageUsers} onClick={() => navigate('/users')} className="rounded-2xl bg-blue-50 p-4 text-left transition-colors enabled:hover:bg-blue-100 disabled:cursor-default">
              <p className="text-xs font-black uppercase tracking-wider text-blue-500">Roles Tracked</p>
              <p className="text-3xl font-black text-blue-700 mt-2">{data.userGovernance?.roleBreakdown?.length || 0}</p>
            </button>
            <button disabled={!canManageUsers} onClick={() => navigate('/users?status=Inactive')} className="rounded-2xl bg-red-50 p-4 text-left transition-colors enabled:hover:bg-red-100 disabled:cursor-default">
              <p className="text-xs font-black uppercase tracking-wider text-red-500">Inactive Users</p>
              <p className="text-3xl font-black text-red-700 mt-2">{data.userGovernance?.inactiveUsers || 0}</p>
            </button>
            <button disabled={!canManageUsers} onClick={() => navigate('/users?governance=password-reset-pending')} className="rounded-2xl bg-amber-50 p-4 text-left transition-colors enabled:hover:bg-amber-100 disabled:cursor-default">
              <p className="text-xs font-black uppercase tracking-wider text-amber-500">Password Resets Pending</p>
              <p className="text-3xl font-black text-amber-700 mt-2">{data.userGovernance?.pendingPasswordResets || 0}</p>
            </button>
            <button disabled={!canManageUsers} onClick={() => navigate('/users?governance=orphaned-institutions&role=Admin&status=Active')} className="rounded-2xl bg-purple-50 p-4 text-left transition-colors enabled:hover:bg-purple-100 disabled:cursor-default">
              <p className="text-xs font-black uppercase tracking-wider text-purple-500">Orphaned Institutions</p>
              <p className="text-3xl font-black text-purple-700 mt-2">{data.userGovernance?.institutionsWithoutActiveAdmins?.length || 0}</p>
            </button>
          </div>

          <UserGovernanceCards governance={data.userGovernance} canManageUsers={canManageUsers} onOpen={openHqAction} />
        </CardContent>
      </Card>

      <div className={`${dashboardView === "governance" ? "grid" : "hidden"} gap-6 grid-cols-1 xl:grid-cols-2`}>
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

      <div className={`${dashboardView === "registries" ? "grid" : "hidden"} gap-6 grid-cols-1 xl:grid-cols-2`}>
        {/* Registered Institutions Management */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col h-[700px]">
          <CardHeader className="p-8 pb-4 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">School Governance</CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  {canManageSystem ? 'Add and manage registered TVET institutions' : 'Registered TVET institutions in your assigned scope'}
                </CardDescription>
              </div>
              {canManageSystem ? <div className="flex items-center gap-2">
                <input
                  id="institution-csv-import"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleInstitutionCsvImport}
                />
                <Button
                  variant="outline"
                  className="rounded-xl border-gray-200 font-bold"
                  disabled={csvImporting}
                  onClick={() => document.getElementById('institution-csv-import')?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {csvImporting ? 'Importing...' : 'Import CSV'}
                </Button>
                <Button
                  onClick={() => { setEditingInstitution(null); setInstOpen(true); }}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl"
                >
                  Register School
                </Button>
              </div> : <Badge className="border border-slate-200 bg-slate-50 text-slate-600">View only</Badge>}
            </div>

            {institutionImportResult && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Import result: {institutionImportResult.createdCount} created, {institutionImportResult.skippedCount} skipped{institutionImportResult.failedRow ? `; stopped at row ${institutionImportResult.failedRow}` : ''}.</p>
                {institutionImportResult.message && <p>{institutionImportResult.message}</p>}
                {institutionImportResult.skipped.length > 0 && (
                  <details className="mt-2 max-h-40 overflow-y-auto">
                    <summary className="cursor-pointer font-semibold">View skipped rows</summary>
                    <ul className="mt-2 list-disc pl-5">
                      {institutionImportResult.skipped.map((item) => <li key={item.row}>Row {item.row}: {item.reason}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-purple-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-purple-700">{data.institutionDetails?.length || 0}</div>
                <div className="text-xs font-bold text-purple-400 mt-1">Total Institutions</div>
              </div>
              <div className="bg-blue-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-blue-700">{institutionRegionCount}</div>
                <div className="text-xs font-bold text-blue-400 mt-1">Regions Covered</div>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-amber-700">{uniqueProgramCount}</div>
                <div className="text-xs font-bold text-amber-400 mt-1">Unique Programs</div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mt-4">
              <Input
                type="text"
                placeholder="Search by institution name, code, or region..."
                value={instSearch}
                onChange={(e) => setInstSearch(e.target.value)}
                className="w-full bg-gray-50 border-gray-200 rounded-2xl pr-16 text-sm font-medium focus:ring-purple-300"
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
              const filtered = (data.institutionDetails || []).filter((inst) => {
                if (!instSearch) return true;
                const q = instSearch.toLowerCase();
                return inst.name?.toLowerCase().includes(q) || inst.code?.includes(q) || inst.region?.toLowerCase().includes(q);
              });

              // Group by region
              const byRegion: Record<string, InstitutionDetail[]> = {};
              filtered.forEach((inst) => {
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
                    const regionPanelId = `institution-region-${region.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'unknown'}`;

                    return (
                      <div key={region} className="border border-gray-100 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setExpandedRegions(prev => 
                            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
                          )}
                          aria-expanded={isExpanded}
                          aria-controls={regionPanelId}
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
                        <div id={regionPanelId} className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {displayInst.map((inst) => (
                            <button
                              type="button"
                              key={inst._id}
                              disabled={!canManageSystem}
                              onClick={() => { setEditingInstitution(inst); setInstOpen(true); }}
                              className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl text-left transition-all group enabled:hover:border-purple-200 enabled:hover:shadow-md disabled:cursor-default"
                            >
                              <div className="p-2 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors shrink-0">
                                <Building2 className="h-4 w-4 text-purple-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-gray-800 truncate leading-tight">{inst.name}</p>
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono font-bold">{inst.code}</span>
                                  {(inst.programs?.length ?? 0) > 0 && (
                                    <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold">{inst.programs?.length} prog</span>
                                  )}
                                  <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-bold">{inst.gender || 'Mixed'}</span>
                                </div>
                              </div>
                            </button>
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

            {canManageSystem ? <Dialog open={instOpen} onOpenChange={setInstOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0 overflow-y-auto">
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
                          availablePrograms={[...new Set((data.institutionDetails || []).flatMap((institution) => institution.programs || []))]}
                          onSuccess={() => {
                            setInstOpen(false);
                            setRefreshKey(prev => prev + 1);
                            toast.success(editingInstitution ? "Institution updated" : "Institution registered");
                          }} 
                          initialData={editingInstitution ?? undefined}
                        />
                    </div>
                </DialogContent>
            </Dialog> : null}
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
              <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/hq-industry-partners')}>
                Open Registry
              </Button>
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

            <div className="relative mt-4">
              <Input
                type="text"
                placeholder="Search by company, sector, region, or contact..."
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                className="w-full bg-gray-50 border-gray-200 rounded-2xl pr-16 text-sm font-medium focus:ring-amber-300"
              />
              {partnerSearch && (
                <button onClick={() => setPartnerSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold">
                  Clear
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-4 flex-1 overflow-hidden flex flex-col">
            {(!data.partnersDetails || data.partnersDetails.length === 0) ? (
              <p className="text-center text-gray-400 py-6">No industry partners found.</p>
            ) : filteredPartners.length === 0 ? (
              <p className="text-center text-gray-400 py-6">No industry partners match your search.</p>
            ) : (
              <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                {filteredPartners.map((partner) => (
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
                          style={{ width: `${(partner.totalSlots ?? 0) > 0 ? Math.min(((partner.usedSlots || 0) / (partner.totalSlots ?? 1)) * 100, 100) : 0}%` }}
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
      <Card className={`${dashboardView === "performance" ? "block" : "hidden"} bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden`}>
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
                aria-label="Export institution breakdown to CSV"
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
          {(data.institutionStats?.length || 0) === 0 ? (
            <p className="text-center text-gray-400 py-8">No institution data yet. Users must register and create learners.</p>
          ) : (
            <div className="space-y-4">
              {visibleInstitutionStats.map((inst) => {
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
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-gray-400">
                  Showing {institutionBreakdownStartIndex + 1}–{Math.min(institutionBreakdownStartIndex + visibleInstitutionStats.length, data.institutionStats.length)} of {data.institutionStats.length} institutions
                </p>
                {institutionBreakdownTotalPages > 1 ? (
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-gray-200 font-bold"
                    onClick={() => setInstitutionBreakdownPage(Math.max(1, currentInstitutionBreakdownPage - 1))}
                    disabled={currentInstitutionBreakdownPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="min-w-[100px] text-center text-sm font-bold text-gray-600">
                    Page {currentInstitutionBreakdownPage} of {institutionBreakdownTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-gray-200 font-bold"
                    onClick={() => setInstitutionBreakdownPage(Math.min(institutionBreakdownTotalPages, currentInstitutionBreakdownPage + 1))}
                    disabled={currentInstitutionBreakdownPage === institutionBreakdownTotalPages}
                  >
                    Next
                  </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
