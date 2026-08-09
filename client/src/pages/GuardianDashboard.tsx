import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, ArrowRight, Bell, Briefcase, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileSignature, History, LifeBuoy, MapPin, MessageSquare, RefreshCw, Send, ShieldAlert, Upload, UserRound } from "lucide-react"
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
import { downloadGuardianConsentPdf } from "@/lib/guardianConsentPdf"

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
    status: "Signed" | "Pending" | "Submitted" | "Rejected"
    signedAt?: string | null
    signedByName?: string
    relationshipToLearner?: string
    contactNumber?: string
    industryName?: string
    startDate?: string | null
    endDate?: string | null
    placementId?: string | null
    submissionMethod?: "Electronic" | "Uploaded" | null
    signedDocument?: { id: string; url: string; fileName: string } | null
    reviewStatus?: "NotRequired" | "PendingReview" | "Accepted" | "Rejected" | null
    reviewComment?: string
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
    partnerName?: string
    sector?: string
    location?: string
    supervisorName?: string
    institution?: string
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
  link?: string
}

type GuardianSection = "overview" | "history" | "alerts" | "support"

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

const consentStatusClass = (status: GuardianLearnerCard["consentForm"]["status"]) => {
  if (status === "Signed") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "Submitted") return "bg-teal-100 text-teal-700 border-teal-200"
  if (status === "Rejected") return "bg-red-100 text-red-700 border-red-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

const consentActionLabel = (status: GuardianLearnerCard["consentForm"]["status"]) => {
  if (status === "Signed") return "Update Consent"
  if (status === "Submitted") return "Replace Uploaded Form"
  if (status === "Rejected") return "Correct Consent"
  return "Sign Consent"
}

export default function GuardianDashboard() {
  const { authFetch } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentLearner, setConsentLearner] = useState<GuardianLearnerCard | null>(null)
  const [signingConsent, setSigningConsent] = useState(false)
  const [consentMethod, setConsentMethod] = useState<"electronic" | "upload">("electronic")
  const [signedConsentFile, setSignedConsentFile] = useState<File | null>(null)
  const [uploadingConsent, setUploadingConsent] = useState(false)
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

  const sectionParam = searchParams.get("section")
  const activeSection: GuardianSection = sectionParam === "history" || sectionParam === "alerts" || sectionParam === "support" ? sectionParam : "overview"

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch("/api/guardian-portal/dashboard")
      if (!res.ok) throw new Error("Failed to load guardian dashboard")
      const payload = await res.json()
      setData(payload)
      setHasLoaded(true)
      setLastUpdatedAt(new Date())
      setConcernDraft((current) => ({
        ...current,
          learnerId: current.learnerId || payload.learners?.[0]?.learner?._id || "",
      }))
      return payload as DashboardPayload
    } catch (error) {
      console.error(error)
      setLoadError("Check your connection, then try again.")
      toast.error(error instanceof Error ? error.message : "Failed to load guardian dashboard")
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  const initialLoading = loading && !hasLoaded
  const dashboardUnavailable = Boolean(loadError && !hasLoaded)

  const updateSection = (section: GuardianSection) => {
    const next = new URLSearchParams(searchParams)
    if (section === "overview") next.delete("section")
    else next.set("section", section)
    setSearchParams(next, { replace: false })
  }

  const linkedLearnerOptions = data?.learners || []
  const totalPendingAttendance = useMemo(
    () => (data?.learners || []).reduce((sum, item) => sum + item.attendanceSummary.pendingEntries, 0),
    [data]
  )
  const pendingConsentCount = useMemo(
    () => (data?.learners || []).filter((item) => item.requiresGuardianConsent && ["Pending", "Rejected"].includes(item.consentForm.status)).length,
    [data]
  )
  const pendingConsentLearners = useMemo(
    () => (data?.learners || []).filter((item) => item.requiresGuardianConsent && ["Pending", "Rejected"].includes(item.consentForm.status)),
    [data]
  )
  const totalPlacementRecords = useMemo(
    () => (data?.learners || []).reduce((sum, item) => sum + item.placementHistory.length, 0),
    [data]
  )
  const consentDeclarationsComplete = consentDraft.understandsProgram
    && consentDraft.followRules
    && consentDraft.respectfulResponsible
    && consentDraft.reportProblems

  const handleMarkNotificationRead = async (notification: NotificationItem) => {
    if (notification.read) return
    try {
      const res = await authFetch(`/api/notifications/${notification._id}/read`, { method: "PUT" })
      if (!res.ok) throw new Error("Failed to mark alert as read")
      setData((current) => current ? {
        ...current,
        notifications: current.notifications.map((item) => item._id === notification._id ? { ...item, read: true } : item),
        unreadNotificationCount: Math.max(0, current.unreadNotificationCount - 1),
      } : current)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to update alert")
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await authFetch("/api/notifications/read-all", { method: "PUT" })
      if (!res.ok) throw new Error("Failed to mark alerts as read")
      setData((current) => current ? {
        ...current,
        notifications: current.notifications.map((item) => ({ ...item, read: true })),
        unreadNotificationCount: 0,
      } : current)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to update alerts")
    }
  }

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
    setConsentMethod("electronic")
    setSignedConsentFile(null)
    setConsentOpen(true)
  }

  const handleDownloadConsent = async () => {
    if (!consentLearner) return
    try {
      await downloadGuardianConsentPdf({
        learnerName: consentLearner.learner.name,
        trackingId: consentLearner.learner.trackingId,
        dateOfBirth: consentLearner.learner.dateOfBirth,
        institution: consentLearner.learner.institution,
        program: consentLearner.learner.program,
        studyYear: consentLearner.learner.year,
        industryName: consentLearner.consentForm.industryName || consentLearner.currentPlacement?.companyName,
        startDate: consentLearner.consentForm.startDate || consentLearner.currentPlacement?.startDate,
        endDate: consentLearner.consentForm.endDate || consentLearner.currentPlacement?.endDate,
        guardianName: consentDraft.guardianFullName,
        guardianPhone: consentDraft.contactNumber,
        relationship: consentDraft.relationshipToLearner,
      })
      toast.success("Consent form downloaded")
    } catch (error) {
      console.error(error)
      toast.error("Could not download the consent form")
    }
  }

  const handleUploadSignedConsent = async () => {
    if (!consentLearner || !signedConsentFile) return
    if (!consentDraft.guardianFullName.trim() || !consentDraft.contactNumber.trim() || !consentDraft.relationshipToLearner.trim()) {
      toast.error("Guardian name, contact number, and relationship are required")
      return
    }
    const placementId = consentLearner.consentForm.placementId || consentLearner.currentPlacement?._id
    if (!placementId) {
      toast.error("A placement is required before consent can be uploaded")
      return
    }

    setUploadingConsent(true)
    let uploadedDocumentId = ""
    try {
      const formData = new FormData()
      formData.append("file", signedConsentFile)
      formData.append("category", "Guardian Consent Form")
      formData.append("learnerId", consentLearner.learner._id)
      formData.append("placementId", placementId)
      const uploadResponse = await authFetch("/api/documents/upload", { method: "POST", body: formData })
      const uploadedDocument = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok) throw new Error(uploadedDocument.message || "Failed to upload signed form")
      uploadedDocumentId = uploadedDocument._id

      const consentResponse = await authFetch("/api/guardian-portal/consent-forms", {
        method: "POST",
        body: JSON.stringify({
          learnerId: consentLearner.learner._id,
          guardianFullName: consentDraft.guardianFullName,
          contactNumber: consentDraft.contactNumber,
          relationshipToLearner: consentDraft.relationshipToLearner,
          submissionMethod: "Uploaded",
          signedDocumentId: uploadedDocumentId,
        }),
      })
      const payload = await consentResponse.json().catch(() => ({}))
      if (!consentResponse.ok) throw new Error(payload.message || "Failed to submit signed consent form")
      toast.success("Signed consent form submitted for institution review")
      setConsentOpen(false)
      setConsentLearner(null)
      setSignedConsentFile(null)
      await fetchDashboard()
    } catch (error) {
      if (uploadedDocumentId) {
        await authFetch(`/api/documents/${uploadedDocumentId}`, { method: "DELETE" }).catch(() => undefined)
      }
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to upload signed consent form")
    } finally {
      setUploadingConsent(false)
    }
  }

  const handleSignConsent = async () => {
    if (!consentLearner) return

    if (!consentDraft.guardianFullName.trim() || !consentDraft.contactNumber.trim() || !consentDraft.relationshipToLearner.trim() || !consentDraft.signatureName.trim()) {
      toast.error("Guardian name, contact number, relationship, and signature are required")
      return
    }
    if (!consentDeclarationsComplete) {
      toast.error("Confirm all learner declarations before signing")
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

  if (initialLoading) {
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
            {lastUpdatedAt ? <p className="mt-2 text-xs font-medium text-slate-500">Last updated {lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p> : null}
          </div>
          <div className="space-y-3 md:min-w-[320px]">
            <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl bg-white/80" disabled={loading} onClick={() => void fetchDashboard()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Refreshing..." : "Refresh data"}
            </Button>
            {!dashboardUnavailable ? <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-2xl border-teal-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Linked Learners</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{data?.learners.length || 0}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-amber-100 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Awaiting Supervisor</p>
                <p className="mt-2 text-2xl font-black text-amber-600">{totalPendingAttendance}</p>
                <p className="mt-1 text-xs text-slate-500">Hours for review</p>
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
            </div> : (
              <div className="rounded-2xl border border-dashed border-red-200 bg-white/70 p-4 text-center text-sm font-semibold text-red-700">
                Dashboard totals are unavailable.
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? "Updating guardian dashboard." : loadError ? "Guardian dashboard update failed." : hasLoaded ? "Guardian dashboard is up to date." : ""}
      </p>

      {loadError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm" role="alert">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              <div>
                <p className="font-black text-slate-900">{hasLoaded ? "Could not refresh the family overview" : "Could not load the family overview"}</p>
                <p className="mt-1 text-sm text-slate-700">{hasLoaded ? "Your last loaded information remains visible. " : "No totals are being presented as current. "}{loadError}</p>
              </div>
            </div>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl border-red-200 bg-white" onClick={() => void fetchDashboard()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!dashboardUnavailable && activeSection === "overview" && (pendingConsentLearners.length > 0 || (data?.unreadNotificationCount || 0) > 0) ? (
        <Card className="rounded-[2rem] border border-amber-200 bg-amber-50/70 shadow-sm" aria-labelledby="guardian-actions-title">
          <CardHeader>
            <CardTitle id="guardian-actions-title" className="text-xl font-black text-slate-900">Needs Your Attention</CardTitle>
            <CardDescription>Only items that you can review or complete are shown here.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0 md:grid-cols-2">
            {pendingConsentLearners.map((item) => (
              <div key={item.learner._id} className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-black text-slate-900">{item.consentForm.status === "Rejected" ? "Consent form needs correction" : "Guardian consent required"}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.consentForm.status === "Rejected" ? item.consentForm.reviewComment || `Upload a corrected form for ${item.learner.name}.` : `Review and sign the WEL consent for ${item.learner.name}.`}</p>
                </div>
                <Button type="button" className="min-h-11 shrink-0 rounded-xl bg-amber-600 text-white hover:bg-amber-700" disabled={!item.consentForm.hasDateOfBirth || !item.consentForm.industryName} onClick={() => openConsentForm(item)}>
                  {item.consentForm.status === "Rejected" ? "Correct consent" : "Sign consent"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
            {(data?.unreadNotificationCount || 0) > 0 ? (
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rose-200 bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-black text-slate-900">Review new alerts</p>
                  <p className="mt-1 text-sm text-slate-600">{data?.unreadNotificationCount} update{data?.unreadNotificationCount === 1 ? "" : "s"} from the institution need your attention.</p>
                </div>
                <Button type="button" variant="outline" className="min-h-11 shrink-0 rounded-xl" onClick={() => updateSection("alerts")}>
                  View alerts
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!dashboardUnavailable ? <Tabs value={activeSection} onValueChange={(value) => updateSection(value as GuardianSection)} className="space-y-6">
        <TabsList className="grid min-h-14 w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:max-w-3xl sm:grid-cols-4">
          <TabsTrigger data-help-id="guardian-dashboard-tab-learners" value="overview" className="min-h-11 rounded-xl font-bold">Overview</TabsTrigger>
          <TabsTrigger value="history" className="min-h-11 rounded-xl font-bold">History{totalPlacementRecords > 0 ? <Badge className="ml-2 border-slate-200 bg-white text-slate-700">{totalPlacementRecords}</Badge> : null}</TabsTrigger>
          <TabsTrigger data-help-id="guardian-dashboard-tab-alerts" value="alerts" className="min-h-11 rounded-xl font-bold">Alerts{(data?.unreadNotificationCount || 0) > 0 ? <Badge className="ml-2 border-0 bg-rose-500 text-white">{data?.unreadNotificationCount}</Badge> : null}</TabsTrigger>
          <TabsTrigger data-help-id="guardian-dashboard-tab-concerns" value="support" className="min-h-11 rounded-xl font-bold">Support</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {(data?.learners || []).length === 0 ? (
            <Card className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 shadow-none">
              <CardContent className="p-10 text-center">
                <UserRound className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 font-black text-slate-900">No learners are linked yet</p>
                <p className="mt-2 text-sm text-slate-600">Ask your institution administrator to link the correct learner to this guardian account.</p>
                <Button type="button" variant="outline" className="mt-5 min-h-11 rounded-xl" onClick={() => updateSection("support")}>Contact support</Button>
              </CardContent>
            </Card>
          ) : null}
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
                        <Badge className={consentStatusClass(item.consentForm.status)}>
                          Consent {item.consentForm.status.toLowerCase()}
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
                          <div className="mt-2 space-y-1 text-xs text-emerald-700">
                            <p>Signed by {item.consentForm.signedByName} ({item.consentForm.relationshipToLearner}) on {item.consentForm.signedAt ? new Date(item.consentForm.signedAt).toLocaleDateString() : "N/A"}.</p>
                            {item.consentForm.submissionMethod === "Uploaded" ? <p>A signed paper copy was uploaded.</p> : null}
                            {item.consentForm.signedDocument?.url ? (
                              <a className="inline-flex items-center font-bold underline underline-offset-2" href={item.consentForm.signedDocument.url} target="_blank" rel="noreferrer">
                                View uploaded form <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        ) : item.consentForm.status === "Submitted" ? (
                          <p className="mt-2 text-xs font-semibold text-teal-700">Your signed form was submitted and is awaiting institution review.</p>
                        ) : item.consentForm.status === "Rejected" ? (
                          <p className="mt-2 text-xs font-semibold text-red-700">The institution returned this form: {item.consentForm.reviewComment || "Please upload a corrected signed copy."}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <Badge className={consentStatusClass(item.consentForm.status)}>
                          {item.consentForm.status}
                        </Badge>
                        <Button
                          className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                          disabled={!item.consentForm.hasDateOfBirth || !item.consentForm.industryName}
                          onClick={() => openConsentForm(item)}
                        >
                          <FileSignature className="mr-2 h-4 w-4" />
                          {consentActionLabel(item.consentForm.status)}
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
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p>Latest: {new Date(item.attendanceSummary.latestEntry.periodEnd).toLocaleDateString()} · {item.attendanceSummary.latestEntry.status}</p>
                        {item.attendanceSummary.pendingEntries > 0 ? <p className="font-semibold text-amber-700">Owner: workplace supervisor · Next: review and sign off</p> : null}
                      </div>
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

                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">Placement History</p>
                    <p className="mt-1 text-sm text-slate-600">{item.placementHistory.length} placement record{item.placementHistory.length === 1 ? "" : "s"} available for this learner.</p>
                  </div>
                  <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => updateSection("history")}>
                    <History className="mr-2 h-4 w-4" />
                    View history
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Placement History for Your Wards</h3>
              <p className="mt-1 text-sm text-slate-600">Review current and previous workplace placements for every learner linked to your guardian account.</p>
            </div>
          </div>

          {(data?.learners || []).length === 0 ? (
            <Card className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 shadow-none">
              <CardContent className="p-10 text-center text-sm text-slate-600">No linked learners are available for placement history.</CardContent>
            </Card>
          ) : (data?.learners || []).map((item) => (
            <Card key={item.learner._id} className="overflow-hidden rounded-[2rem] border border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><UserRound className="h-5 w-5 text-teal-600" />{item.learner.name}</CardTitle>
                    <CardDescription className="mt-1">{item.learner.trackingId} · {item.learner.program} · {item.learner.institution}</CardDescription>
                  </div>
                  <Badge className="w-fit border-violet-200 bg-violet-100 text-violet-700">{item.placementHistory.length} record{item.placementHistory.length === 1 ? "" : "s"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 md:p-6">
                {item.placementHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No placement history has been recorded for this learner.</div>
                ) : (
                  <ol className="space-y-4" aria-label={`Placement history for ${item.learner.name}`}>
                    {item.placementHistory.map((placement) => (
                      <li key={placement.placementId} className="relative rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-black text-slate-900">{placement.companyName}</p>
                              <Badge className={placement.status === "Active" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : placement.status === "Completed" ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-slate-100 text-slate-700"}>{placement.status}</Badge>
                            </div>
                            <p className="mt-1 text-xs font-black uppercase tracking-wider text-violet-600">Cycle {placement.cycleNumber}{placement.academicYear ? ` · ${placement.academicYear}` : ""}</p>
                            {placement.partnerName && placement.partnerName !== placement.companyName ? <p className="mt-2 text-sm text-slate-600">Industry partner: {placement.partnerName}</p> : null}
                          </div>
                          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 md:text-right">
                            {placement.startDate ? new Date(placement.startDate).toLocaleDateString() : "Start date TBD"}
                            <span className="mx-2 text-slate-400">to</span>
                            {placement.endDate ? new Date(placement.endDate).toLocaleDateString() : "End date TBD"}
                          </div>
                        </div>
                        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Location</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{placement.location || "Not recorded"}</dd></div>
                          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Sector</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{placement.sector || "Not recorded"}</dd></div>
                          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Supervisor</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{placement.supervisorName || "Not recorded"}</dd></div>
                          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Institution</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{placement.institution || item.learner.institution}</dd></div>
                        </dl>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="rounded-[2rem] border border-slate-200 shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-900"><Bell className="h-5 w-5 text-rose-600" /> Latest Alerts</CardTitle>
                <CardDescription className="mt-1">Updates for awareness. Items requiring action appear on Overview.</CardDescription>
              </div>
              {(data?.unreadNotificationCount || 0) > 0 ? (
                <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => void handleMarkAllNotificationsRead()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark all as read
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.notifications || []).length === 0 ? (
                <p className="text-sm text-slate-500">No notifications yet.</p>
              ) : (data?.notifications || []).map((notification) => (
                <article key={notification._id} className={`rounded-2xl border p-4 ${notification.read ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-rose-50/60"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{notification.title}</p>
                    {!notification.read ? <Badge className="bg-rose-100 text-rose-700 border-rose-200">New</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</p>
                    {!notification.read ? (
                      <Button type="button" variant="ghost" className="min-h-11 rounded-xl text-teal-700" onClick={() => void handleMarkNotificationRead(notification)}>
                        Mark as read
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card data-help-id="guardian-dashboard-concerns" className="rounded-[2rem] border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">New Concern</CardTitle>
              <CardDescription>Report a welfare, placement, data, or communication concern to the institution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2 text-sm font-bold text-slate-700">
                Learner
                <select aria-label="Learner for concern" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal" value={concernDraft.learnerId} onChange={(e) => setConcernDraft((current) => ({ ...current, learnerId: e.target.value }))}>
                  <option value="">Select learner</option>
                  {linkedLearnerOptions.map((item) => <option key={item.learner._id} value={item.learner._id}>{item.learner.name} ({item.learner.trackingId})</option>)}
                </select>
              </label>
              <Input aria-label="Concern subject" placeholder="Concern subject" value={concernDraft.subject} onChange={(e) => setConcernDraft((current) => ({ ...current, subject: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <select aria-label="Concern category" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={concernDraft.category} onChange={(e) => setConcernDraft((current) => ({ ...current, category: e.target.value }))}>
                  <option value="Workflow">Workflow</option><option value="Data">Data</option><option value="Training">Training</option><option value="Other">Other</option>
                </select>
                <select aria-label="Concern priority" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={concernDraft.priority} onChange={(e) => setConcernDraft((current) => ({ ...current, priority: e.target.value }))}>
                  <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option>
                </select>
              </div>
              <Textarea aria-label="Concern details" placeholder="Describe the concern and what you need the institution to review." value={concernDraft.description} onChange={(e) => setConcernDraft((current) => ({ ...current, description: e.target.value }))} rows={5} />
              <Button className="min-h-11 w-full rounded-xl bg-teal-600 text-white hover:bg-teal-700" disabled={creatingConcern} onClick={handleCreateConcern}>
                <LifeBuoy className="mr-2 h-4 w-4" />{creatingConcern ? "Submitting..." : "Submit Concern"}
              </Button>
            </CardContent>
          </Card>

          <section aria-labelledby="guardian-concern-threads-title" className="space-y-4">
            <div>
              <h3 id="guardian-concern-threads-title" className="text-xl font-black text-slate-900">Concern Threads</h3>
              <p className="mt-1 text-sm text-slate-600">Continue existing conversations and monitor the institution’s response.</p>
            </div>
            {(data?.tickets || []).length === 0 ? (
              <Card className="rounded-[2rem] border border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-sm text-slate-500">No concern threads yet.</CardContent></Card>
            ) : (data?.tickets || []).map((ticket) => (
              <Card key={ticket._id} className="rounded-[2rem] border border-slate-200 shadow-sm">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{ticket.subject}</p><Badge variant="outline">{ticket.status}</Badge><Badge className="bg-slate-100 text-slate-700 border-slate-200">{ticket.priority}</Badge></div>
                    <p className="mt-2 text-sm text-slate-600">{ticket.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{ticket.learner?.name || "Learner"} · Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</p>
                  </div>
                  <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => openTicketThread(ticket)}><MessageSquare className="mr-2 h-4 w-4" />Open Thread</Button>
                </CardContent>
              </Card>
            ))}
          </section>
        </TabsContent>
      </Tabs> : null}

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
            <Textarea aria-label="Reply to concern thread" rows={4} placeholder="Write a reply..." value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} />
            <Button className="min-h-11 w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={submittingReply || !replyDraft.trim()} onClick={handleReply}>
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

              <Tabs value={consentMethod} onValueChange={(value) => setConsentMethod(value as "electronic" | "upload")} className="space-y-5">
                <TabsList className="grid min-h-12 w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <TabsTrigger value="electronic" className="min-h-10 rounded-lg font-bold">Sign online</TabsTrigger>
                  <TabsTrigger value="upload" className="min-h-10 rounded-lg font-bold">Download & upload</TabsTrigger>
                </TabsList>

                <TabsContent value="electronic" className="space-y-5">
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
                    <Input aria-label="Parent or guardian full name" placeholder="Parent/Guardian full name" value={consentDraft.guardianFullName} onChange={(e) => setConsentDraft((current) => ({ ...current, guardianFullName: e.target.value }))} />
                    <Input aria-label="Guardian contact number" placeholder="Contact number" value={consentDraft.contactNumber} onChange={(e) => setConsentDraft((current) => ({ ...current, contactNumber: e.target.value }))} />
                    <Input aria-label="Relationship to learner" placeholder="Relationship to learner" value={consentDraft.relationshipToLearner} onChange={(e) => setConsentDraft((current) => ({ ...current, relationshipToLearner: e.target.value }))} />
                    <Input aria-label="Guardian signature name" placeholder="Type full name as signature" value={consentDraft.signatureName} onChange={(e) => setConsentDraft((current) => ({ ...current, signatureName: e.target.value }))} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p>I hereby give my consent for my child to participate in the Workplace Experience Learning (WEL) Program as required by their institution.</p>
                    <p className="mt-2">I understand that my child will be in a real working environment and must follow all safety and conduct rules.</p>
                  </div>

                  {!consentDeclarationsComplete ? <p className="text-sm font-semibold text-amber-700">Confirm all four learner declarations to enable signing.</p> : null}
                  <Button className="min-h-11 w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={signingConsent || !consentDeclarationsComplete} onClick={handleSignConsent}>
                    <FileSignature className="mr-2 h-4 w-4" />
                    {signingConsent ? "Signing..." : "Sign Consent Form"}
                  </Button>
                </TabsContent>

                <TabsContent value="upload" className="space-y-5">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="font-black text-slate-900">1. Download and sign</p>
                    <p className="mt-1 text-sm text-slate-600">Download the prefilled form, print it, complete every checkbox, then sign and date it.</p>
                    <Button type="button" variant="outline" className="mt-4 min-h-11 rounded-xl border-sky-200 bg-white" onClick={() => void handleDownloadConsent()}>
                      <Download className="mr-2 h-4 w-4" />
                      Download consent form (PDF)
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div>
                      <p className="font-black text-slate-900">2. Upload the signed form</p>
                      <p className="mt-1 text-sm text-slate-600">Upload a clear PDF or photo showing the completed and signed form.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input aria-label="Parent or guardian full name for uploaded consent" placeholder="Parent/Guardian full name" value={consentDraft.guardianFullName} onChange={(e) => setConsentDraft((current) => ({ ...current, guardianFullName: e.target.value }))} />
                      <Input aria-label="Guardian contact number for uploaded consent" placeholder="Contact number" value={consentDraft.contactNumber} onChange={(e) => setConsentDraft((current) => ({ ...current, contactNumber: e.target.value }))} />
                      <Input className="md:col-span-2" aria-label="Relationship for uploaded consent" placeholder="Relationship to learner" value={consentDraft.relationshipToLearner} onChange={(e) => setConsentDraft((current) => ({ ...current, relationshipToLearner: e.target.value }))} />
                    </div>
                    <label className="block rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition-colors hover:border-teal-400">
                      <Upload className="mx-auto h-7 w-7 text-teal-600" />
                      <span className="mt-2 block text-sm font-bold text-slate-800">{signedConsentFile ? signedConsentFile.name : "Choose signed PDF or photo"}</span>
                      <span className="mt-1 block text-xs text-slate-500">PDF, JPG, PNG, or WebP · maximum 10 MB</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null
                          if (file && file.size > 10 * 1024 * 1024) {
                            toast.error("The signed form must be 10 MB or smaller")
                            event.target.value = ""
                            setSignedConsentFile(null)
                            return
                          }
                          setSignedConsentFile(file)
                        }}
                      />
                    </label>
                    <Button className="min-h-11 w-full rounded-xl bg-teal-600 text-white hover:bg-teal-700" disabled={uploadingConsent || !signedConsentFile} onClick={() => void handleUploadSignedConsent()}>
                      <Upload className="mr-2 h-4 w-4" />
                      {uploadingConsent ? "Uploading and submitting..." : "Upload signed consent form"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
