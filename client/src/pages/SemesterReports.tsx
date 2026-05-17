import { useState, useEffect } from "react"
import {
  type ColumnDef,
} from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import {
  FileText,
  Plus,
  Eye,
  Send,
  ShieldCheck,
  RefreshCw,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/ui/data-table"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { useNavigate, useSearchParams } from "react-router-dom"
import { X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AcademicTermOption {
  _id: string;
  name: string;
  academicYear: string;
  termType: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface SemesterReport {
  _id: string;
  institution: string;
  semester: string;
  academicYear: string;
  periodStart: string;
  periodEnd: string;
  status: 'Generated' | 'Draft' | 'Certified' | 'Submitted' | 'Regional_Approved' | 'HQ_Approved' | 'Rejected';
  generatedBy: { _id: string; name: string; email: string };
  certifiedBy?: { _id: string; name: string; email: string };
  certifiedAt?: string;
  academicTerm?: AcademicTermOption;
  createdAt: string;
  metrics?: {
    placementRate: number;
    avgHealthScore: number;
    visitCoverage: number;
    assessmentCoverage: number;
    ticketResolutionRate: number;
  };
  exceptions?: { learnerId: string; learnerName: string; reasons: string[] }[];
  summary: {
    totalLearners: number;
    currentEnrolled: number;
    academicActive: number;
    academicGraduating: number;
    academicGraduated: number;
    academicDropped: number;
    placed: number;
    pending: number;
    completed: number;
    dropped: number;
    totalMonitoringVisits: number;
    totalCompetencyAssessments: number;
    programBreakdown: { program: string; count: number }[];
  };
}

interface SemesterReportsResponse {
  items: SemesterReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  academicYearOptions: string[];
  stats: {
    draftCount: number;
    certifiedCount: number;
    submittedCount: number;
    approvedCount: number;
    currentEnrolled: number;
    graduated: number;
  };
}

const statusColors: Record<string, string> = {
  Generated: "bg-gray-100 text-gray-700",
  Draft: "bg-slate-100 text-slate-700",
  Certified: "bg-indigo-100 text-indigo-700",
  Submitted: "bg-blue-100 text-blue-700",
  Regional_Approved: "bg-amber-100 text-amber-700",
  HQ_Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  Generated: "Legacy",
  Draft: "Draft",
  Certified: "Certified",
  Submitted: "Submitted",
  Regional_Approved: "Regional Approved",
  HQ_Approved: "HQ Approved",
  Rejected: "Rejected",
};

export default function SemesterReports() {
  const [reports, setReports] = useState<SemesterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalReports, setTotalReports] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);
  const [reportStats, setReportStats] = useState({
    draftCount: 0,
    certifiedCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    currentEnrolled: 0,
    graduated: 0,
  });
  const [showInitiate, setShowInitiate] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [terms, setTerms] = useState<AcademicTermOption[]>([]);
  const [selectedTermId, setSelectedTermId] = useState("");
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const institutionFilter = searchParams.get("institution") || "";
  const academicYearFilter = searchParams.get("academicYear") || "";

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (institutionFilter) params.set("institution", institutionFilter);
      if (academicYearFilter) params.set("academicYear", academicYearFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await authFetch(`/api/semester-reports?${params.toString()}`);
      const payload = await res.json().catch(() => null) as SemesterReportsResponse | null;
      if (!res.ok) {
        throw new Error((payload as { message?: string } | null)?.message || "Failed to load reports");
      }
      setReports(Array.isArray(payload?.items) ? payload.items : []);
      setTotalReports(typeof payload?.total === "number" ? payload.total : 0);
      setTotalPages(typeof payload?.totalPages === "number" ? payload.totalPages : 0);
      setAcademicYearOptions(Array.isArray(payload?.academicYearOptions) ? payload.academicYearOptions : []);
      setReportStats(payload?.stats || {
        draftCount: 0,
        certifiedCount: 0,
        submittedCount: 0,
        approvedCount: 0,
        currentEnrolled: 0,
        graduated: 0,
      });
    } catch (err) {
      console.error("Error fetching reports:", err);
      setReports([]);
      setTotalReports(0);
      setTotalPages(0);
      setAcademicYearOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTerms = async () => {
    try {
      const res = await authFetch('/api/academic-terms');
      if (res.ok) {
        const data = await res.json();
        setTerms(data);
      }
    } catch (err) {
      console.error("Error fetching terms:", err);
    }
  };

  useEffect(() => {
    fetchReports();
    fetchTerms();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch, page, pageSize, statusFilter, institutionFilter, academicYearFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, institutionFilter, academicYearFilter]);

  const activeFilters = [
    statusFilter ? `Status: ${statusLabels[statusFilter] || statusFilter}` : "",
    institutionFilter ? `Institution: ${institutionFilter}` : "",
    academicYearFilter ? `Academic Year: ${academicYearFilter}` : "",
  ].filter(Boolean);

  // Which terms don't have reports yet
  const usedTermIds = new Set(reports.map(r => r.academicTerm?._id).filter(Boolean));
  const availableTerms = terms.filter(t => !usedTermIds.has(t._id));

  const handleInitiate = async () => {
    if (!selectedTermId) {
      toast.error("Please select an academic term");
      return;
    }
    setInitiating(true);
    try {
      const res = await authFetch('/api/semester-reports/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termId: selectedTermId }),
      });
      if (res.ok) {
        const report = await res.json();
        toast.success("Term closure initiated! Redirecting…");
        setShowInitiate(false);
        setSelectedTermId("");
        navigate(`/semester-reports/${report._id}`);
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to initiate closure");
      }
    } catch {
      toast.error("Failed to initiate closure");
    } finally {
      setInitiating(false);
    }
  };

  // Stats strip
  const columns: ColumnDef<SemesterReport>[] = [
    {
      accessorKey: "semester",
      header: "Term",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900">{row.original.semester}</span>
          <span className="text-xs text-gray-500">{row.original.academicYear}</span>
        </div>
      ),
    },
    {
      accessorKey: "institution",
      header: "Institution",
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block font-medium">{row.original.institution}</span>
      ),
    },
    {
      accessorKey: "periodStart",
      header: "Period",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {format(new Date(row.original.periodStart), 'dd MMM yyyy')} – {format(new Date(row.original.periodEnd), 'dd MMM yyyy')}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={`${statusColors[row.original.status]} border-0 rounded-lg font-bold`}>
          {statusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      id: "healthScore",
      header: "Health",
      cell: ({ row }) => {
        const hs = row.original.metrics?.avgHealthScore;
        if (hs == null) return <span className="text-gray-400 text-sm">—</span>;
        const color = hs >= 80 ? 'text-emerald-600' : hs >= 60 ? 'text-blue-600' : hs >= 40 ? 'text-amber-600' : 'text-red-600';
        return <span className={`font-black text-sm ${color}`}>{hs}/100</span>;
      },
    },
    {
      id: "exceptions",
      header: "Exceptions",
      cell: ({ row }) => {
        const count = row.original.exceptions?.length || 0;
        if (count === 0) return <Badge className="bg-emerald-50 text-emerald-600 border-0 font-bold">Clear</Badge>;
        return <Badge className="bg-red-50 text-red-600 border-0 font-bold">{count} issue{count !== 1 ? 's' : ''}</Badge>;
      },
    },
    {
      id: "academicLifecycle",
      header: "Lifecycle",
      meta: {
        exportValue: (report: SemesterReport) => `${report.summary.currentEnrolled || 0} current / ${report.summary.academicGraduated || 0} graduated`,
      },
      cell: ({ row }) => (
        <div className="flex flex-col text-xs font-bold">
          <span className="text-sky-700">{row.original.summary.currentEnrolled || 0} current</span>
          <span className="text-emerald-700">{row.original.summary.academicGraduated || 0} graduated</span>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => format(new Date(row.original.createdAt), 'dd MMM yyyy'),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const report = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/semester-reports/${report._id}`)}
              className="rounded-xl"
            >
              <Eye className="h-4 w-4 mr-1" /> View
            </Button>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 md:space-y-8 p-4 md:p-8 pt-12 md:pt-16">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Term Closure Reports</h2>
          <p className="text-gray-400 font-bold mt-1">Structured end-of-term reporting with auto-generated metrics</p>
        </div>
        {user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
          <Button
            data-help-id="semester-reports-initiate"
            onClick={() => setShowInitiate(true)}
            className="w-full md:w-auto rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold"
          >
            <Plus className="h-4 w-4 mr-2" /> Initiate Closure
          </Button>
        )}
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Draft', count: reportStats.draftCount, color: 'bg-slate-50 text-slate-700 border-slate-100', icon: <FileText className="h-4 w-4" /> },
          { label: 'Certified', count: reportStats.certifiedCount, color: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: <ShieldCheck className="h-4 w-4" /> },
          { label: 'Submitted', count: reportStats.submittedCount, color: 'bg-blue-50 text-blue-700 border-blue-100', icon: <Send className="h-4 w-4" /> },
          { label: 'Approved', count: reportStats.approvedCount, color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <ShieldCheck className="h-4 w-4" /> },
          { label: 'Current Enrolled', count: reportStats.currentEnrolled, color: 'bg-sky-50 text-sky-700 border-sky-100', icon: <FileText className="h-4 w-4" /> },
          { label: 'Graduated', count: reportStats.graduated, color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <ShieldCheck className="h-4 w-4" /> },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl border p-4 ${stat.color}`}>
            <div className="flex items-center gap-2 mb-1">
              {stat.icon}
              <span className="text-xs font-black uppercase tracking-widest">{stat.label}</span>
            </div>
            <p className="text-2xl font-black">{stat.count}</p>
          </div>
        ))}
      </div>

      <Card className="bg-white border-none sm:border sm:border-gray-100 rounded-2xl sm:rounded-[2rem] shadow-sm sm:shadow-xl overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Report Status</label>
              <Select
                value={statusFilter || "__all_statuses"}
                onValueChange={(value) => {
                  const next = new URLSearchParams(searchParams)
                  if (value === "__all_statuses") next.delete("status")
                  else next.set("status", value)
                  setSearchParams(next)
                }}
              >
                <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_statuses">All statuses</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Academic Year</label>
              <Select
                value={academicYearFilter || "__all_academic_years"}
                onValueChange={(value) => {
                  const next = new URLSearchParams(searchParams)
                  if (value === "__all_academic_years") next.delete("academicYear")
                  else next.set("academicYear", value)
                  setSearchParams(next)
                }}
              >
                <SelectTrigger className="rounded-xl border-gray-200 bg-gray-50">
                  <SelectValue placeholder="All academic years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_academic_years">All academic years</SelectItem>
                  {academicYearOptions.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full rounded-xl border-gray-200"
                onClick={() => setSearchParams({})}
                disabled={!statusFilter && !institutionFilter && !academicYearFilter}
              >
                <Filter className="mr-2 h-4 w-4" />
                Clear Report Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {activeFilters.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <span key={filter} className="text-xs font-black text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-full">
                {filter}
              </span>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setSearchParams({})} className="h-9 rounded-xl text-amber-700 hover:text-amber-800 hover:bg-amber-100">
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        </div>
      )}

      <Card data-help-id="semester-reports-table" className="bg-white border-none sm:border sm:border-gray-100 rounded-2xl sm:rounded-[2rem] shadow-sm sm:shadow-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-0">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[#FFB800]" />
            <div>
              <CardTitle className="text-xl font-black">All Reports</CardTitle>
              <CardDescription className="text-gray-400 font-bold">
                {totalReports} report{totalReports !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 mt-4 sm:mt-0">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-medium text-gray-500">
                Showing {reports.length === 0 ? 0 : ((page - 1) * pageSize) + 1}
                {" "}-{" "}
                {Math.min(page * pageSize, totalReports)}
                {" "}of{" "}
                <span className="font-bold text-gray-900">{totalReports}</span> reports
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="min-w-[120px] text-center text-sm font-semibold text-gray-600">
                  Page {page} of {Math.max(totalPages, 1)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setPage((prev) => Math.min(prev + 1, Math.max(totalPages, 1)))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
            <DataTable columns={columns} data={reports} disablePagination exportTitle="Term Closure Reports Export" />
          </div>
        </CardContent>
      </Card>

      {/* Initiate Closure Dialog */}
      <Dialog open={showInitiate} onOpenChange={setShowInitiate}>
        <DialogContent className="rounded-2xl sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Initiate Term Closure</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select an academic term to generate a closure report with auto-computed metrics and exception tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">Academic Term</label>
              {availableTerms.length === 0 ? (
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <p className="text-sm text-gray-500 font-medium">No available terms. All terms already have closure reports, or no terms have been created yet.</p>
                  <Button variant="link" onClick={() => { setShowInitiate(false); navigate('/calendar'); }} className="mt-1 text-[#FFB800]">
                    Manage Academic Terms →
                  </Button>
                </div>
              ) : (
                <div data-help-id="semester-reports-term-selector" className="space-y-2">
                  {availableTerms.map(term => (
                    <label
                      key={term._id}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        selectedTermId === term._id
                          ? 'border-[#FFB800] bg-[#FFB800]/5'
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="term"
                        value={term._id}
                        checked={selectedTermId === term._id}
                        onChange={() => setSelectedTermId(term._id)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedTermId === term._id ? 'border-[#FFB800]' : 'border-gray-300'}`}>
                        {selectedTermId === term._id && <div className="w-2 h-2 rounded-full bg-[#FFB800]" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{term.name} <span className="text-gray-400">· {term.academicYear}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(term.startDate), 'dd MMM yyyy')} – {format(new Date(term.endDate), 'dd MMM yyyy')}
                          <Badge className={`ml-2 border-0 text-[10px] font-bold ${term.status === 'Active' ? 'bg-green-100 text-green-700' : term.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                            {term.status}
                          </Badge>
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitiate(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleInitiate}
              disabled={initiating || !selectedTermId}
              className="rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${initiating ? 'animate-spin' : ''}`} />
              {initiating ? 'Generating...' : 'Initiate Closure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
