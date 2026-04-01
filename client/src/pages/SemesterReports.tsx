import { useState, useEffect, useMemo } from "react"
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

interface SemesterReport {
  _id: string;
  institution: string;
  semester: string;
  academicYear: string;
  periodStart: string;
  periodEnd: string;
  status: 'Generated' | 'Submitted' | 'Regional_Approved' | 'HQ_Approved' | 'Rejected';
  generatedBy: { _id: string; name: string; email: string };
  createdAt: string;
  summary: {
    totalLearners: number;
    placed: number;
    pending: number;
    completed: number;
    dropped: number;
    totalMonitoringVisits: number;
    totalCompetencyAssessments: number;
    programBreakdown: { program: string; count: number }[];
  };
}

const statusColors: Record<string, string> = {
  Generated: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  Regional_Approved: "bg-amber-100 text-amber-700",
  HQ_Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  Generated: "Generated",
  Submitted: "Submitted",
  Regional_Approved: "Regional Approved",
  HQ_Approved: "HQ Approved",
  Rejected: "Rejected",
};

export default function SemesterReports() {
  const [reports, setReports] = useState<SemesterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formData, setFormData] = useState({
    semester: 'Semester 1',
    academicYear: '',
    periodStart: '',
    periodEnd: '',
  });
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const institutionFilter = searchParams.get("institution") || "";
  const semesterFilter = searchParams.get("semester") || "";
  const academicYearFilter = searchParams.get("academicYear") || "";
  const deadlineView = searchParams.get("deadlineView") || "";

  const fetchReports = async () => {
    try {
      const res = await authFetch('/api/semester-reports');
      const data = await res.json();
      setReports(data);
    } catch (err) {
      console.error("Error fetching semester reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter && report.status !== statusFilter) return false;
      if (institutionFilter && report.institution !== institutionFilter) return false;
      if (semesterFilter && report.semester !== semesterFilter) return false;
      if (academicYearFilter && report.academicYear !== academicYearFilter) return false;
      return true;
    });
  }, [reports, statusFilter, institutionFilter, semesterFilter, academicYearFilter]);

  const activeFilters = [
    deadlineView === "overdue" ? "View: Overdue submissions" : "",
    deadlineView === "at-risk" ? "View: At-risk cycle" : "",
    statusFilter ? `Status: ${statusFilter}` : "",
    institutionFilter ? `Institution: ${institutionFilter}` : "",
    semesterFilter ? `Semester: ${semesterFilter}` : "",
    academicYearFilter ? `Year: ${academicYearFilter}` : "",
  ].filter(Boolean);

  const handleGenerate = async () => {
    if (!formData.academicYear || !formData.periodStart || !formData.periodEnd) {
      toast.error("Please fill in all fields");
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch('/api/semester-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("Semester report generated successfully!");
        setShowGenerate(false);
        setFormData({ semester: 'Semester 1', academicYear: '', periodStart: '', periodEnd: '' });
        fetchReports();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to generate report");
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (id: string) => {
    try {
      const res = await authFetch(`/api/semester-reports/${id}/submit`, {
        method: 'PUT',
      });
      if (res.ok) {
        toast.success("Report submitted to Regional Office");
        fetchReports();
      } else {
        const err = await res.json();
        toast.error(err.message);
      }
    } catch {
      toast.error("Failed to submit report");
    }
  };

  const columns: ColumnDef<SemesterReport>[] = [
    {
      accessorKey: "semester",
      header: "Semester",
      cell: ({ row }) => (
        <span className="font-bold">{row.original.semester}</span>
      ),
    },
    {
      accessorKey: "academicYear",
      header: "Academic Year",
    },
    {
      accessorKey: "institution",
      header: "Institution",
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block">{row.original.institution}</span>
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
      accessorKey: "createdAt",
      header: "Generated",
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
            {(report.status === 'Generated' || report.status === 'Rejected') && user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSubmit(report._id)}
                className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Send className="h-4 w-4 mr-1" /> Submit
              </Button>
            )}
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
    <div className="flex-1 space-y-6 md:space-y-8 p-4 md:p-8 pt-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Semester Reports</h2>
          <p className="text-gray-400 font-bold mt-1">Auto-generated institutional performance reports</p>
        </div>
        {user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
          <Button
            onClick={() => setShowGenerate(true)}
            className="w-full md:w-auto rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold"
          >
            <Plus className="h-4 w-4 mr-2" /> Generate Report
          </Button>
        )}
      </div>

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

      <Card className="bg-white border-none sm:border sm:border-gray-100 rounded-2xl sm:rounded-[2rem] shadow-sm sm:shadow-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-6 pb-0">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[#FFB800]" />
            <div>
              <CardTitle className="text-xl font-black">All Reports</CardTitle>
              <CardDescription className="text-gray-400 font-bold">
                {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 mt-4 sm:mt-0">
          <DataTable columns={columns} data={filteredReports} exportTitle="Semester Reports Export" />
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Generate Semester Report</DialogTitle>
            <DialogDescription className="text-gray-400">
              This will aggregate all learner activities for your institution within the selected period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">Semester</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              >
                <option value="Semester 1">Semester 1</option>
                <option value="Semester 2">Semester 2</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1">Academic Year</label>
              <input
                type="text"
                placeholder="e.g. 2025/2026"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">Period Start</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  value={formData.periodStart}
                  onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">Period End</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  value={formData.periodEnd}
                  onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold"
            >
              {generating ? 'Generating...' : 'Generate Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
