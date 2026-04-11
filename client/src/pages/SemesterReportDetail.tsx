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
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Building2, Users,
  Briefcase, ClipboardList, GraduationCap, ShieldCheck,
  RefreshCw, AlertTriangle, HeartPulse, Clock, Percent,
  MessageSquare, FileText,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

interface ReportException {
  learnerId: string;
  learnerName: string;
  trackingId: string;
  reasons: string[];
}

interface ReportMetrics {
  placementRate: number;
  avgHealthScore: number;
  attendanceLogCount: number;
  totalHoursLogged: number;
  avgHoursPerLearner: number;
  visitCoverage: number;
  assessmentCoverage: number;
  ticketsOpened: number;
  ticketsResolved: number;
  ticketResolutionRate: number;
}

interface ReportCommentary {
  challenges: string;
  highlights: string;
  recommendations: string;
}

interface ReportData {
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
  certifiedBy?: { _id: string; name: string; email: string };
  certifiedAt?: string;
  regionalComment?: string;
  hqComment?: string;
  createdAt: string;
  academicTerm?: { _id: string; name: string; academicYear: string; termType: string };
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
  metrics?: ReportMetrics;
  exceptions?: ReportException[];
  commentary?: ReportCommentary;
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

export default function SemesterReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch, user } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Commentary state (editable in Draft)
  const [commentary, setCommentary] = useState<ReportCommentary>({
    challenges: '',
    highlights: '',
    recommendations: '',
  });

  useEffect(() => {
    authFetch(`/api/semester-reports/${id}`)
      .then(res => { if (!res.ok) throw new Error('Not found'); return res.json(); })
      .then(data => {
        setReport(data);
        setCommentary(data.commentary || { challenges: '', highlights: '', recommendations: '' });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, authFetch]);

  const handleAction = async (action: string, body?: object) => {
    setActing(true);
    try {
      const res = await authFetch(`/api/semester-reports/${id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || { comment }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReport(updated);
        setCommentary(updated.commentary || { challenges: '', highlights: '', recommendations: '' });
        toast.success(`Report ${action.replace(/-/g, ' ')} successfully!`);
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

  const handleCertify = () => handleAction('certify', { commentary });
  const handleSubmit = () => handleAction('submit');

  const handleRefreshMetrics = async () => {
    setRefreshing(true);
    try {
      const res = await authFetch(`/api/semester-reports/${id}/refresh-metrics`, { method: 'PUT' });
      if (res.ok) {
        const updated = await res.json();
        setReport(updated);
        toast.success("Metrics refreshed successfully!");
      } else {
        const err = await res.json();
        toast.error(err.message);
      }
    } catch {
      toast.error("Failed to refresh metrics");
    } finally {
      setRefreshing(false);
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
  const m = report.metrics;
  const exceptions = report.exceptions || [];
  const isDraft = report.status === 'Draft';
  const isRejected = report.status === 'Rejected';
  const isCertified = report.status === 'Certified';
  const isSubmitted = report.status === 'Submitted';
  const isRegionalApproved = report.status === 'Regional_Approved';
  const isApproved = report.status === 'HQ_Approved';
  const canEdit = isDraft || isRejected;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-12 md:pt-16">
      {/* --- Header --- */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/semester-reports')} className="rounded-xl mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {report.academicTerm?.name || report.semester} — {report.academicYear}
            </h2>
            <Badge className={`${statusColors[report.status]} border-0 rounded-lg font-bold text-base px-4 py-1.5`}>
              {statusLabels[report.status]}
            </Badge>
          </div>
          <p className="text-gray-400 font-bold mt-1">
            {report.institution} • {format(new Date(report.periodStart), 'dd MMM yyyy')} – {format(new Date(report.periodEnd), 'dd MMM yyyy')}
          </p>
        </div>
        {isDraft && (
          <Button
            variant="outline"
            onClick={handleRefreshMetrics}
            disabled={refreshing}
            className="rounded-xl border-gray-200 font-bold shrink-0"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </Button>
        )}
      </div>

      {/* --- Auto-Generated Metrics Strip --- */}
      {m && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Placement Rate', value: `${m.placementRate}%`, icon: <Briefcase className="h-4 w-4" />, color: m.placementRate >= 60 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50' },
            { label: 'Avg Health', value: `${m.avgHealthScore}`, icon: <HeartPulse className="h-4 w-4" />, color: m.avgHealthScore >= 60 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50' },
            { label: 'Visit Coverage', value: `${m.visitCoverage}%`, icon: <ClipboardList className="h-4 w-4" />, color: m.visitCoverage >= 80 ? 'text-emerald-600 bg-emerald-50' : m.visitCoverage >= 40 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50' },
            { label: 'Assessment Coverage', value: `${m.assessmentCoverage}%`, icon: <GraduationCap className="h-4 w-4" />, color: m.assessmentCoverage >= 80 ? 'text-emerald-600 bg-emerald-50' : m.assessmentCoverage >= 40 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50' },
            { label: 'Attendance Logs', value: `${m.attendanceLogCount}`, icon: <Clock className="h-4 w-4" />, color: m.attendanceLogCount > 0 ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50' },
            { label: 'Ticket Resolution', value: `${m.ticketResolutionRate}%`, icon: <Percent className="h-4 w-4" />, color: m.ticketResolutionRate >= 80 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50' },
          ].map(metric => (
            <div key={metric.label} className={`rounded-2xl p-4 ${metric.color}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {metric.icon}
                <span className="text-[10px] font-black uppercase tracking-widest">{metric.label}</span>
              </div>
              <p className="text-2xl font-black">{metric.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* --- Summary Cards --- */}
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
            <p className="text-xs text-muted-foreground mt-1">{m?.placementRate || 0}% placement rate</p>
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

      {/* --- Learner Status + Programs --- */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardHeader className="p-8 pb-0">
            <CardTitle className="text-xl font-black">Academic Lifecycle Breakdown</CardTitle>
            <CardDescription className="text-gray-400 font-bold">
              Current enrolled learners are tracked separately from graduates.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-3">
              {([
                { label: 'Current Enrolled', value: s.currentEnrolled ?? 0, color: 'text-sky-600 bg-sky-50' },
                { label: 'Academic Active', value: s.academicActive ?? 0, color: 'text-indigo-600 bg-indigo-50' },
                { label: 'Graduating', value: s.academicGraduating ?? 0, color: 'text-amber-600 bg-amber-50' },
                { label: 'Graduated', value: s.academicGraduated ?? 0, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Academic Dropped', value: s.academicDropped ?? 0, color: 'text-rose-600 bg-rose-50' },
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
            <CardTitle className="text-xl font-black">Learner Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-3">
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

      {/* --- Exception List --- */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <CardTitle className="text-xl font-black">Exception List</CardTitle>
                <CardDescription className="text-gray-400 font-bold">
                  Learners with incomplete placement records
                </CardDescription>
              </div>
            </div>
            <Badge className={`border-0 font-bold text-sm px-3 py-1 ${exceptions.length === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {exceptions.length === 0 ? 'All Clear' : `${exceptions.length} exception${exceptions.length !== 1 ? 's' : ''}`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          {exceptions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
              <p className="font-bold text-gray-500">No exceptions found — all placed learners have complete records.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">
                <div className="col-span-4">Learner</div>
                <div className="col-span-2">Tracking ID</div>
                <div className="col-span-6">Issues</div>
              </div>
              {exceptions.map((exc, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-center p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
                  <div className="col-span-4">
                    <span className="font-bold text-gray-900">{exc.learnerName}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs font-mono text-[#FFB800]">{exc.trackingId || '—'}</span>
                  </div>
                  <div className="col-span-6 flex flex-wrap gap-1.5">
                    {exc.reasons.map((reason, j) => (
                      <Badge key={j} className="bg-red-50 text-red-600 border-0 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Institution Commentary --- */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-indigo-500" />
            <div>
              <CardTitle className="text-xl font-black">Institution Commentary</CardTitle>
              <CardDescription className="text-gray-400 font-bold">
                {canEdit ? 'Document your observations for this term' : 'Submitted commentary'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-5">
          {([
            { key: 'challenges' as const, label: 'Challenges', placeholder: 'What challenges did the institution face this term?', color: 'border-l-red-400' },
            { key: 'highlights' as const, label: 'Highlights', placeholder: 'What went well? Key achievements and milestones...', color: 'border-l-emerald-400' },
            { key: 'recommendations' as const, label: 'Recommendations', placeholder: 'What improvements are recommended for next term?', color: 'border-l-blue-400' },
          ]).map(field => (
            <div key={field.key} className={`border-l-4 ${field.color} pl-5`}>
              <label className="text-sm font-black text-gray-700 block mb-2">{field.label}</label>
              {canEdit ? (
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 resize-none bg-gray-50"
                  rows={3}
                  placeholder={field.placeholder}
                  value={commentary[field.key]}
                  onChange={(e) => setCommentary(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 min-h-[60px]">
                  {report.commentary?.[field.key] || <span className="text-gray-400 italic">No commentary provided</span>}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* --- Certify & Submit Actions --- */}
      {!isApproved && (
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl">
          <CardContent className="p-8">
            <div className="flex flex-col gap-5">
              {/* Certification info */}
              {report.certifiedBy && (
                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-bold text-indigo-700">
                      Certified by {report.certifiedBy.name}
                    </p>
                    {report.certifiedAt && (
                      <p className="text-xs text-indigo-500">on {format(new Date(report.certifiedAt), 'dd MMM yyyy, HH:mm')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Review comment (for reviewers) */}
              {(isSubmitted || isRegionalApproved) && (user?.role === 'RegionalAdmin' || user?.role === 'SuperAdmin') && (
                <div>
                  <label className="text-sm font-bold text-gray-700 block mb-2">Review Comment (optional)</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 resize-none"
                    rows={3}
                    placeholder="Add a review comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 flex-wrap">
                {/* Draft → Certify */}
                {canEdit && user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
                  <Button
                    onClick={handleCertify}
                    disabled={acting}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    {acting ? 'Certifying...' : 'Certify Report'}
                  </Button>
                )}

                {/* Certified → Submit */}
                {isCertified && user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
                  <Button
                    onClick={handleSubmit}
                    disabled={acting}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {acting ? 'Submitting...' : 'Submit to Regional'}
                  </Button>
                )}

                {/* Regional Approve */}
                {isSubmitted && user?.role === 'RegionalAdmin' && (
                  <>
                    <Button onClick={() => handleAction('regional-approve')} disabled={acting} className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve (Regional)
                    </Button>
                    <Button onClick={() => handleAction('reject')} disabled={acting} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold">
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </>
                )}

                {/* HQ Approve */}
                {isRegionalApproved && user?.role === 'SuperAdmin' && (
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

      {/* --- Review History --- */}
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

      {/* --- Footer meta --- */}
      <div className="text-xs text-gray-400 font-bold pb-4">
        <FileText className="h-3 w-3 inline mr-1" />
        Generated by {report.generatedBy?.name} on {format(new Date(report.createdAt), 'dd MMM yyyy, HH:mm')}
      </div>
    </div>
  );
}
