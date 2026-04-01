import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ArrowLeft, Send, CheckCircle2, XCircle, Building2, Users, Briefcase, ClipboardList, GraduationCap } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

interface SemesterReportData {
  _id: string;
  institution: string;
  semester: string;
  academicYear: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  generatedBy: { _id: string; name: string; email: string };
  reviewedByRegional?: { _id: string; name: string; email: string };
  reviewedByHQ?: { _id: string; name: string; email: string };
  regionalComment?: string;
  hqComment?: string;
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

export default function SemesterReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch, user } = useAuth();
  const [report, setReport] = useState<SemesterReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    authFetch(`/api/semester-reports/${id}`)
      .then(res => res.json())
      .then(data => { setReport(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, authFetch]);

  const handleAction = async (action: string) => {
    setActing(true);
    try {
      const res = await authFetch(`/api/semester-reports/${id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReport(updated);
        toast.success(`Report ${action.replace('-', ' ')} successfully!`);
        setComment("");
      } else {
        const err = await res.json();
        toast.error(err.message);
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex-1 p-8 pt-6 text-center text-gray-500">
        Report not found.
        <Button variant="link" onClick={() => navigate('/semester-reports')}>Go back</Button>
      </div>
    );
  }

  const s = report.summary;
  const placementRate = s.totalLearners > 0 ? Math.round((s.placed / s.totalLearners) * 100) : 0;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/semester-reports')} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            {report.semester} — {report.academicYear}
          </h2>
          <p className="text-gray-400 font-bold mt-1">
            {report.institution} • {format(new Date(report.periodStart), 'dd MMM yyyy')} – {format(new Date(report.periodEnd), 'dd MMM yyyy')}
          </p>
        </div>
        <Badge className={`${statusColors[report.status]} border-0 rounded-lg font-bold text-base px-4 py-1.5`}>
          {statusLabels[report.status]}
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalLearners}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Placed</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{s.placed}</div>
            <p className="text-xs text-muted-foreground mt-1">{placementRate}% placement rate</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitoring Visits</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{s.totalMonitoringVisits}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assessments</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">{s.totalCompetencyAssessments}</div>
          </CardContent>
        </Card>
      </div>

      {/* Learner Status Breakdown + Programs */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-xl font-black">Learner Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-4">
              {([
                { label: 'Pending', value: s.pending, color: 'text-amber-600 bg-amber-50' },
                { label: 'Placed', value: s.placed, color: 'text-green-600 bg-green-50' },
                { label: 'Completed', value: s.completed, color: 'text-indigo-600 bg-indigo-50' },
                { label: 'Dropped', value: s.dropped, color: 'text-red-600 bg-red-50' },
              ]).map(item => (
                <div key={item.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <span className="text-base font-bold text-gray-700">{item.label}</span>
                  <span className={`text-xl font-black px-3 py-1 rounded-xl ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-xl font-black">Program Breakdown</CardTitle>
            <CardDescription className="text-gray-400 font-bold">Learners enrolled per trade/program</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {s.programBreakdown.length > 0 ? s.programBreakdown.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#FFB800]/10 rounded-xl">
                      <Building2 className="h-4 w-4 text-[#FFB800]" />
                    </div>
                    <span className="font-bold text-gray-800">{p.program}</span>
                  </div>
                  <span className="text-lg font-black text-gray-900">{p.count}</span>
                </div>
              )) : (
                <p className="text-center text-gray-400 py-4">No program data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review History */}
      {(report.reviewedByRegional || report.reviewedByHQ || report.regionalComment || report.hqComment) && (
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-xl font-black">Review History</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-4">
            {report.reviewedByRegional && (
              <div className="p-4 bg-amber-50 rounded-2xl">
                <p className="text-sm font-bold text-amber-700">Regional Review by {report.reviewedByRegional.name}</p>
                {report.regionalComment && <p className="text-sm text-amber-600 mt-1">{report.regionalComment}</p>}
              </div>
            )}
            {report.reviewedByHQ && (
              <div className="p-4 bg-green-50 rounded-2xl">
                <p className="text-sm font-bold text-green-700">HQ Review by {report.reviewedByHQ.name}</p>
                {report.hqComment && <p className="text-sm text-green-600 mt-1">{report.hqComment}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {report.status !== 'HQ_Approved' && (
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardContent className="p-8">
            <div className="flex flex-col gap-4">
              {(report.status === 'Submitted' || report.status === 'Regional_Approved') && (
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-2">Review Comment (optional)</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 resize-none"
                    rows={3}
                    placeholder="Add a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {(report.status === 'Generated' || report.status === 'Rejected') && user?.role !== 'SuperAdmin' && (
                  <Button onClick={() => handleAction('submit')} disabled={acting} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                    <Send className="h-4 w-4 mr-2" /> Submit to Regional
                  </Button>
                )}
                {report.status === 'Submitted' && user?.role === 'RegionalAdmin' && (
                  <>
                    <Button onClick={() => handleAction('regional-approve')} disabled={acting} className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve (Regional)
                    </Button>
                    <Button onClick={() => handleAction('reject')} disabled={acting} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold">
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
                {report.status === 'Regional_Approved' && user?.role === 'SuperAdmin' && (
                  <>
                    <Button onClick={() => handleAction('hq-approve')} disabled={acting} className="rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve (HQ)
                    </Button>
                    <Button onClick={() => handleAction('reject')} disabled={acting} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold">
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meta info */}
      <div className="text-xs text-gray-400 font-bold">
        Generated by {report.generatedBy?.name} on {format(new Date(report.createdAt), 'dd MMM yyyy, HH:mm')}
      </div>
    </div>
  );
}
