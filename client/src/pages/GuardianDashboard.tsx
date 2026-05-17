import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Bell, Briefcase, ClipboardCheck, FileSignature, LifeBuoy, MapPin, MessageSquare, Send, ShieldAlert, UserRound } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"

type GuardianLearnerCard = {
  learner: {
    _id: string
    name: string
    trackingId: string
    institution: string
    program: string
    year: string
    academicStatus: string
    status: string
    dateOfBirth?: string
  }
  age: number | null
  requiresGuardianConsent: boolean
  consentForm: {
    requiresConsent: boolean
    hasDateOfBirth: boolean
    age: number | null
    status: "Signed" | "Pending"
    signedAt?: string | null
    signedByName?: string
    relationshipToLearner?: string
    contactNumber?: string
    industryName?: string
    startDate?: string | null
    endDate?: string | null
    placementId?: string | null
  }
  currentPlacement: {
    _id: string
    companyName: string
    location?: string
    startDate?: string
    endDate?: string
    status: string
    supervisorName?: string
    partner?: { name?: string } | null
  } | null
  placementHistory: Array<{
    placementId: string
    cycleNumber: number
    academicYear?: string
    companyName: string
    location?: string
    status: string
    startDate?: string
    endDate?: string
  }>
  attendanceSummary: {
    totalHours: number
    latestEntry?: {
      periodEnd: string
      hoursWorked: number
      status: string
      placement?: { companyName?: string }
    } | null
    pendingEntries: number
    rejectedEntries: number
    signedOffEntries: number
  }
  monitoringSummary: {
    latestVisit?: { visitDate: string; visitType?: string } | null
    totalVisits: number
  }
  assessmentSummary: {
    latestAssessment?: { assessmentDate: string; overallScore?: number; assessmentType?: string } | null
    totalAssessments: number
  }
  employerEvaluationSummary: {
    latestEvaluation?: { evaluationDate: string; overallScore?: number; wouldHire?: boolean; partner?: { name?: string } | null } | null
    totalEvaluations: number
  }
}

type NotificationItem = {
  _id: string
  title: string
  message: string
  createdAt: string
  read?: boolean
}

type SupportTicket = {
  _id: string
  subject: string
  category: string
  priority: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  learner?: { _id: string; name: string; trackingId?: string } | null
  placement?: { _id: string; companyName: string; status: string } | null
  replies?: Array<{
    _id: string
    message: string
    createdByName: string
    createdByRole: string
    createdAt: string
  }>
}

type DashboardPayload = {
  user: { _id: string; name: string; email: string; phone?: string }
  learners: GuardianLearnerCard[]
  notifications: NotificationItem[]
  tickets: SupportTicket[]
  unreadNotificationCount: number
}

export default function GuardianDashboard() {
  const { authFetch } = useAuth()
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentLearner, setConsentLearner] = useState<GuardianLearnerCard | null>(null)
  const [signingConsent, setSigningConsent] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null)
  const [submittingReply, setSubmittingReply] = useState(false)
  const [replyDraft, setReplyDraft] = useState("")
  const [consentDraft, setConsentDraft] = useState({
    guardianFullName: "",
    contactNumber: "",
    relationshipToLearner: "Parent",
    signatureName: "",
    understandsProgram: false,
    followRules: false,
    respectfulResponsible: false,
    reportProblems: false,
  })
  const [concernDraft, setConcernDraft] = useState({
    subject: "",
    category: "Workflow",
    priority: "Medium",
    description: "",
    learnerId: "",
  })
  const [creatingConcern, setCreatingConcern] = useState(false)

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await authFetch("/api/guardian-portal/dashboard")
      if (!res.ok) throw new Error("Failed to load guardian dashboard")
      const payload = await res.json()
      setData(payload)
      setConcernDraft((current) => ({
        ...current,
          learnerId: current.learnerId || payload.learners?.[0]?.learner?._id || "",
      }))
      return payload as DashboardPayload
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to load guardian dashboard")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const linkedLearnerOptions = data?.learners || []
  const totalPendingAttendance = useMemo(
    () => (data?.learners || []).reduce((sum, item) => sum + item.attendanceSummary.pendingEntries, 0),
    [data]
  )
  const pendingConsentCount = useMemo(
    () => (data?.learners || []).filter((item) => item.requiresGuardianConsent && item.consentForm.status !== "Signed").length,
    [data]
  )

  const openConsentForm = (item: GuardianLearnerCard) => {
    setConsentLearner(item)
    setConsentDraft({
      guardianFullName: data?.user.name || "",
      contactNumber: data?.user.phone || "",
      relationshipToLearner: "Parent",
      signatureName: data?.user.name || "",
      understandsProgram: false,
      followRules: false,
      respectfulResponsible: false,
      reportProblems: false,
    })
    setConsentOpen(true)
  }

  const handleSignConsent = async () => {
    if (!consentLearner) return

    if (!consentDraft.guardianFullName.trim() || !consentDraft.contactNumber.trim() || !consentDraft.relationshipToLearner.trim() || !consentDraft.signatureName.trim()) {
      toast.error("Guardian name, contact number, relationship, and signature are required")
      return
    }

    setSigningConsent(true)
    try {
      const res = await authFetch("/api/guardian-portal/consent-forms", {
        method: "POST",
        body: JSON.stringify({
          learnerId: consentLearner.learner._id,
          guardianFullName: consentDraft.guardianFullName,
          contactNumber: consentDraft.contactNumber,
          relationshipToLearner: consentDraft.relationshipToLearner,
          signatureName: consentDraft.signatureName,
          learnerDeclaration: {
            understandsProgram: consentDraft.understandsProgram,
            followRules: consentDraft.followRules,
            respectfulResponsible: consentDraft.respectfulResponsible,
            reportProblems: consentDraft.reportProblems,
          },
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to sign consent form")
      toast.success("Consent form signed")
      setConsentOpen(false)
      setConsentLearner(null)
      await fetchDashboard()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to sign consent form")
    } finally {
      setSigningConsent(false)
    }
  }

  const handleCreateConcern = async () => {
    if (!concernDraft.subject.trim() || !concernDraft.description.trim() || !concernDraft.learnerId) {
      toast.error("Subject, learner, and description are required")
      return
    }

    setCreatingConcern(true)
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        body: JSON.stringify({
          ...concernDraft,
          learnerId: concernDraft.learnerId,
          ticketType: "Support",
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to submit concern")
      toast.success("Concern submitted")
      setConcernDraft({
        subject: "",
        category: "Workflow",
        priority: "Medium",
        description: "",
        learnerId: concernDraft.learnerId,
      })
      fetchDashboard()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to submit concern")
    } finally {
      setCreatingConcern(false)
    }
  }

  const openTicketThread = async (ticket: SupportTicket) => {
    setActiveTicket(ticket)
    setTicketOpen(true)
    setReplyDraft("")
    try {
      await authFetch(`/api/support-tickets/${ticket._id}/read`, { method: "PUT" })
    } catch (error) {
      console.error("Error marking ticket as read:", error)
    }
  }

  const handleReply = async () => {
    if (!activeTicket || !replyDraft.trim()) return
    setSubmittingReply(true)
    try {
      const res = await authFetch(`/api/support-tickets/${activeTicket._id}/replies`, {
        method: "POST",
        body: JSON.stringify({ message: replyDraft.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || "Failed to send reply")
      toast.success("Reply sent")
      setReplyDraft("")
      const refreshed = await fetchDashboard()
      setActiveTicket((current) => refreshed?.tickets?.find((ticket) => ticket._id === current?._id) || current)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to send reply")
    } finally {
      setSubmittingReply(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-8">
        <Skeleton className="h-32 w-full rounded-[2rem]" />
        <Skeleton className="h-72 w-full rounded-[2rem]" />
        <Skeleton className="h-72 w-full rounded-[2rem]" />
      </div>
    )
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="rounded-[2rem] border border-teal-100 bg-gradient-to-br from-white via-teal-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-600">Parent / Guardian Portal</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Family Overview</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Track placements, attendance, assessments, and notifications for your linked learners. Use the concern desk to contact the institution support team.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[320px]">
            <Card className="rounded-2xl border-teal-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Linked Learners</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{data?.learners.length || 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-amber-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending Hours</p>
                <p className="mt-2 text-2xl font-black text-amber-600">{totalPendingAttendance}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-sky-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending Consent</p>
                <p className="mt-2 text-2xl font-black text-sky-600">{pendingConsentCount}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-rose-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">New Alerts</p>
                <p className="mt-2 text-2xl font-black text-rose-600">{data?.unreadNotificationCount || 0}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Tabs defaultValue="learners" className="space-y-6">
        <TabsList className="grid w-full max-w-xl grid-cols-3 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger data-help-id="guardian-dashboard-tab-learners" value="learners" className="rounded-xl font-bold">Learners</TabsTrigger>
          <TabsTrigger data-help-id="guardian-dashboard-tab-alerts" value="alerts" className="rounded-xl font-bold">Alerts</TabsTrigger>
          <TabsTrigger data-help-id="guardian-dashboard-tab-concerns" value="concerns" className="rounded-xl font-bold">Concerns</TabsTrigger>
        </TabsList>

        <TabsContent value="learners" className="space-y-6">
          {(data?.learners || []).map((item) => (
            <Card key={item.learner._id} data-help-id="guardian-dashboard-learners" className="rounded-[2rem] border border-slate-200 shadow-sm">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-900">
                      <UserRound className="h-5 w-5 text-teal-600" />
                      {item.learner.name}
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm text-slate-600">
                      {item.learner.program} · {item.learner.year} · {item.learner.institution}
                    </CardDescription>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">{item.learner.trackingId}</Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">{item.learner.academicStatus}</Badge>
                      <Badge className="bg-teal-100 text-teal-700 border-teal-200">{item.learner.status}</Badge>
                      {item.requiresGuardianConsent ? (
                        <Badge className={item.consentForm.status === "Signed" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                          {item.consentForm.status === "Signed" ? "Consent signed" : "Consent required"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:min-w-[260px]">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Current Placement</p>
                    {item.currentPlacement ? (
                      <>
                        <p className="mt-2 font-bold text-slate-900">{item.currentPlacement.companyName}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.currentPlacement.location || "Location not set"}</p>
                        {item.currentPlacement.supervisorName ? <p className="mt-1 text-sm text-slate-600">Supervisor: {item.currentPlacement.supervisorName}</p> : null}
                        <p className="mt-2 text-xs text-slate-500">
                          {item.currentPlacement.startDate ? new Date(item.currentPlacement.startDate).toLocaleDateString() : "TBD"} to {item.currentPlacement.endDate ? new Date(item.currentPlacement.endDate).toLocaleDateString() : "TBD"}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No active placement recorded.</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {item.requiresGuardianConsent ? (
                  <div data-help-id="guardian-dashboard-consent" className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-amber-700">Under-18 WEL Consent</p>
                        <p className="mt-2 text-sm text-slate-700">
                          {item.learner.name} is {item.age ?? "under 18"} and requires signed parent or guardian consent for workplace experience learning.
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          Industry: {item.consentForm.industryName || item.currentPlacement?.companyName || "Not assigned yet"} ·
                          Start: {item.consentForm.startDate ? new Date(item.consentForm.startDate).toLocaleDateString() : item.currentPlacement?.startDate ? new Date(item.currentPlacement.startDate).toLocaleDateString() : "TBD"} ·
                          End: {item.consentForm.endDate ? new Date(item.consentForm.endDate).toLocaleDateString() : item.currentPlacement?.endDate ? new Date(item.currentPlacement.endDate).toLocaleDateString() : "TBD"}
                        </p>
                        {!item.consentForm.hasDateOfBirth ? (
                          <p className="mt-2 text-xs font-semibold text-red-600">Date of birth is missing on the learner record. Ask the institution to complete it before consent can be signed.</p>
                        ) : null}
                        {item.consentForm.status === "Signed" ? (
                          <p className="mt-2 text-xs text-emerald-700">
                            Signed by {item.consentForm.signedByName} ({item.consentForm.relationshipToLearner}) on {item.consentForm.signedAt ? new Date(item.consentForm.signedAt).toLocaleDateString() : "N/A"}.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <Badge className={item.consentForm.status === "Signed" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                          {item.consentForm.status}
                        </Badge>
                        <Button
                          className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                          disabled={!item.consentForm.hasDateOfBirth || !item.consentForm.industryName}
                          onClick={() => openConsentForm(item)}
                        >
                          <FileSignature className="mr-2 h-4 w-4" />
                          {item.consentForm.status === "Signed" ? "Update Consent" : "Sign Consent"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <ClipboardCheck className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-bold">Attendance</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-slate-900">{item.attendanceSummary.totalHours}</p>
                    <p className="text-xs text-slate-500">Total hours logged</p>
                    {item.attendanceSummary.latestEntry ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Latest: {new Date(item.attendanceSummary.latestEntry.periodEnd).toLocaleDateString()} · {item.attendanceSummary.latestEntry.status}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="h-4 w-4 text-sky-600" />
                      <span className="text-sm font-bold">Monitoring</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-slate-900">{item.monitoringSummary.totalVisits}</p>
                    <p className="text-xs text-slate-500">Visits recorded</p>
                    {item.monitoringSummary.latestVisit ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Latest: {new Date(item.monitoringSummary.latestVisit.visitDate).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <ShieldAlert className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-bold">Assessments</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-slate-900">{item.assessmentSummary.totalAssessments}</p>
                    <p className="text-xs text-slate-500">Assessments submitted</p>
                    {item.assessmentSummary.latestAssessment ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Latest score: {item.assessmentSummary.latestAssessment.overallScore ?? "N/A"}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Briefcase className="h-4 w-4 text-violet-600" />
                      <span className="text-sm font-bold">Employer Feedback</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-slate-900">{item.employerEvaluationSummary.totalEvaluations}</p>
                    <p className="text-xs text-slate-500">Evaluations received</p>
                    {item.employerEvaluationSummary.latestEvaluation ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Hire recommendation: {item.employerEvaluationSummary.latestEvaluation.wouldHire ? "Yes" : "No"}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-wider text-slate-400">Placement History</p>
                  {item.placementHistory.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No placement history recorded yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {item.placementHistory.map((placement) => (
                        <div key={placement.placementId} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-900">{placement.companyName}</p>
                              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                                Cycle {placement.cycleNumber}{placement.academicYear ? ` · ${placement.academicYear}` : ""}
                              </p>
                            </div>
                            <Badge variant="outline">{placement.status}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{placement.location || "Location not set"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {placement.startDate ? new Date(placement.startDate).toLocaleDateString() : "TBD"} to {placement.endDate ? new Date(placement.endDate).toLocaleDateString() : "TBD"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="alerts" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[2rem] border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900"><Bell className="h-5 w-5 text-rose-600" /> Latest Notifications</CardTitle>
              <CardDescription>Recent learner and placement updates sent to your portal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.notifications || []).length === 0 ? (
                <p className="text-sm text-slate-500">No notifications yet.</p>
              ) : (data?.notifications || []).map((notification) => (
                <div key={notification._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{notification.title}</p>
                    {!notification.read ? <Badge className="bg-rose-100 text-rose-700 border-rose-200">New</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-help-id="guardian-dashboard-concerns" className="rounded-[2rem] border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Concern Desk</CardTitle>
              <CardDescription>Report a welfare, placement, or communication concern to the institution support team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={concernDraft.learnerId}
                onChange={(e) => setConcernDraft((current) => ({ ...current, learnerId: e.target.value }))}
              >
                <option value="">Select learner</option>
                {linkedLearnerOptions.map((item) => (
                  <option key={item.learner._id} value={item.learner._id}>
                    {item.learner.name} ({item.learner.trackingId})
                  </option>
                ))}
              </select>
              <Input placeholder="Concern subject" value={concernDraft.subject} onChange={(e) => setConcernDraft((current) => ({ ...current, subject: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={concernDraft.category}
                  onChange={(e) => setConcernDraft((current) => ({ ...current, category: e.target.value }))}
                >
                  <option value="Workflow">Workflow</option>
                  <option value="Data">Data</option>
                  <option value="Training">Training</option>
                  <option value="Other">Other</option>
                </select>
                <select
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={concernDraft.priority}
                  onChange={(e) => setConcernDraft((current) => ({ ...current, priority: e.target.value }))}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <Textarea
                placeholder="Describe the concern, including any learner welfare or placement issues you want the institution to review."
                value={concernDraft.description}
                onChange={(e) => setConcernDraft((current) => ({ ...current, description: e.target.value }))}
                rows={5}
              />
              <Button className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={creatingConcern} onClick={handleCreateConcern}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                {creatingConcern ? "Submitting..." : "Submit Concern"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="concerns" className="space-y-4">
          {(data?.tickets || []).length === 0 ? (
            <Card className="rounded-[2rem] border border-slate-200 shadow-sm">
              <CardContent className="p-8 text-center text-sm text-slate-500">No concern threads yet.</CardContent>
            </Card>
          ) : (data?.tickets || []).map((ticket) => (
            <Card key={ticket._id} className="rounded-[2rem] border border-slate-200 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{ticket.subject}</p>
                    <Badge variant="outline">{ticket.status}</Badge>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200">{ticket.priority}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{ticket.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {ticket.learner?.name || "Learner"} · Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                <Button variant="outline" className="rounded-xl" onClick={() => openTicketThread(ticket)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Open Thread
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-2xl bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">{activeTicket?.subject || "Concern Thread"}</DialogTitle>
            <DialogDescription className="text-slate-600">
              Continue the conversation with the institution support team for this concern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Original Concern</p>
                <p className="mt-2 text-sm text-slate-700">{activeTicket?.description}</p>
              </div>
              {(activeTicket?.replies || []).map((reply) => (
                <div key={reply._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{reply.createdByName}</p>
                    <p className="text-xs text-slate-400">{new Date(reply.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{reply.createdByRole}</p>
                  <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{reply.message}</p>
                </div>
              ))}
            </div>
            <Textarea rows={4} placeholder="Write a reply..." value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} />
            <Button className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={submittingReply} onClick={handleReply}>
              <Send className="mr-2 h-4 w-4" />
              {submittingReply ? "Sending..." : "Send Reply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent
          overlayClassName="bg-black/45 backdrop-blur-md"
          className="sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-white border-slate-200"
        >
          <DialogHeader>
            <DialogTitle className="text-slate-900">Consent Form for Learners Under 18</DialogTitle>
            <DialogDescription className="text-slate-600">
              Complete the parent or guardian consent based on the WEL consent template provided by the institution.
            </DialogDescription>
          </DialogHeader>
          {consentLearner ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Learner Details</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <p className="text-sm text-slate-700"><span className="font-semibold">Full Name:</span> {consentLearner.learner.name}</p>
                  <p className="text-sm text-slate-700"><span className="font-semibold">Date of Birth:</span> {consentLearner.learner.dateOfBirth ? new Date(consentLearner.learner.dateOfBirth).toLocaleDateString() : "Not set"}</p>
                  <p className="text-sm text-slate-700"><span className="font-semibold">Institution:</span> {consentLearner.learner.institution}</p>
                  <p className="text-sm text-slate-700"><span className="font-semibold">Course/Program:</span> {consentLearner.learner.program}</p>
                  <p className="text-sm text-slate-700"><span className="font-semibold">Industry:</span> {consentLearner.consentForm.industryName || consentLearner.currentPlacement?.companyName || "Not assigned"}</p>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Placement Period:</span> {consentLearner.consentForm.startDate ? new Date(consentLearner.consentForm.startDate).toLocaleDateString() : consentLearner.currentPlacement?.startDate ? new Date(consentLearner.currentPlacement.startDate).toLocaleDateString() : "TBD"} to {consentLearner.consentForm.endDate ? new Date(consentLearner.consentForm.endDate).toLocaleDateString() : consentLearner.currentPlacement?.endDate ? new Date(consentLearner.currentPlacement.endDate).toLocaleDateString() : "TBD"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Learner Declaration</p>
                <p className="mt-2 text-sm text-slate-600">Confirm that the learner understands the WEL expectations captured in the source consent form.</p>
                <div className="mt-4 space-y-3">
                  {[
                    ["understandsProgram", "The learner understands what the WEL program is."],
                    ["followRules", "The learner will follow all company rules and instructions."],
                    ["respectfulResponsible", "The learner will be respectful and responsible at all times."],
                    ["reportProblems", "The learner will inform the supervisor or teacher if any problems arise."],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <Checkbox
                        checked={consentDraft[key as keyof typeof consentDraft] as boolean}
                        onCheckedChange={(checked) => setConsentDraft((current) => ({ ...current, [key]: Boolean(checked) }))}
                      />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Parent/Guardian full name" value={consentDraft.guardianFullName} onChange={(e) => setConsentDraft((current) => ({ ...current, guardianFullName: e.target.value }))} />
                <Input placeholder="Contact number" value={consentDraft.contactNumber} onChange={(e) => setConsentDraft((current) => ({ ...current, contactNumber: e.target.value }))} />
                <Input placeholder="Relationship to learner" value={consentDraft.relationshipToLearner} onChange={(e) => setConsentDraft((current) => ({ ...current, relationshipToLearner: e.target.value }))} />
                <Input placeholder="Type full name as signature" value={consentDraft.signatureName} onChange={(e) => setConsentDraft((current) => ({ ...current, signatureName: e.target.value }))} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>I hereby give my consent for my child to participate in the Workplace Experience Learning (WEL) Program as required by their institution.</p>
                <p className="mt-2">I understand that my child will be in a real working environment and must follow all safety and conduct rules.</p>
              </div>

              <Button className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={signingConsent} onClick={handleSignConsent}>
                <FileSignature className="mr-2 h-4 w-4" />
                {signingConsent ? "Signing..." : "Sign Consent Form"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
