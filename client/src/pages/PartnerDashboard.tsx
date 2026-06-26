import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { AlertTriangle, Building2, Briefcase, CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList, Clock3, FileClock, FileSignature, LifeBuoy, MessageSquare, NotebookPen, Pencil, Plus, Search, Star, Trash2, UserCircle2, XCircle, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmationDialog } from "@/components/ConfirmationDialog"
import { EmployerEvaluationForm } from "./EmployerEvaluationForm"
import type { EmployerEvaluationDraft } from "./EmployerEvaluationForm"
import { AttendanceLogForm } from "./AttendanceLogForm"
import { PlacementMessagesDialog } from "@/components/PlacementMessagesDialog"
import { DocumentList } from "@/components/DocumentList"
import { DocumentUpload } from "@/components/DocumentUpload"
import { downloadPlacementAgreementPdf } from "@/lib/placementAgreementPdf"
import { downloadWELLogbookPdf } from "@/lib/welLogbookPdf"

interface PartnerActionItem {
  type: string
  placementId: string
  learnerId: string
  learnerName: string
  trackingId: string
  message: string
  actionUrl: string
  severity: "high" | "medium" | "low"
}

interface PartnerPlacement {
  _id: string
  status: "Active" | "Completed" | "Terminated"
  companyName: string
  location: string
  institution: string
  startDate: string
  endDate: string
  supervisorName?: string
  supervisorPhone?: string
  supervisorEmail?: string
  partnerSupervisor?: {
    _id: string
    name: string
    email?: string
    phone?: string
  } | null
  assignedToCurrentSupervisor?: boolean
  unreadMessageCount?: number
  openSupportCount?: number
  evaluationSubmitted?: boolean
  evaluationStatus?: "Completed" | "Pending"
  evaluationDueSoon?: boolean
  daysUntilEvaluationDue?: number | null
  evaluation?: {
    _id?: string
    version?: number
    isCurrent?: boolean
    evaluatorName: string
    evaluatorPosition: string
    evaluationDate: string
    overallScore: number
    strengths: string
    areasForImprovement: string
    wouldHire: boolean
    additionalComments?: string
    metrics: {
      punctualityAndAttendance: number
      technicalSkills: number
      abilityToLearn: number
      teamworkAndCommunication: number
      initiativeAndProblemSolving: number
    }
  } | null
  evaluationHistory?: Array<{
    _id?: string
    version?: number
    isCurrent?: boolean
    evaluatorName: string
    evaluatorPosition: string
    evaluationDate: string
    overallScore: number
    strengths: string
    areasForImprovement: string
    wouldHire: boolean
    additionalComments?: string
    metrics: {
      punctualityAndAttendance: number
      technicalSkills: number
      abilityToLearn: number
      teamworkAndCommunication: number
      initiativeAndProblemSolving: number
    }
  }>
  operationalReadiness?: {
    isOperational: boolean
    missingFields: string[]
  }
  institutionOwner?: {
    _id: string
    name: string
    role: string
  } | null
  learner?: {
    _id: string
    name: string
    trackingId: string
    program: string
    year?: string
  }
  agreementSummary?: {
    employerSigned: boolean
    employerSignedAt?: string | null
    employerSignerName?: string
    employerBusinessName?: string
    employerSignatureName?: string
    learnerSigned: boolean
    learnerSignedAt?: string | null
    learnerSignerName?: string
    learnerSignatureName?: string
    fullySigned: boolean
  }
}

type TicketCategory = "Technical" | "Access" | "Data" | "Workflow" | "Training" | "Other"
type TicketPriority = "Low" | "Medium" | "High" | "Urgent"
type IncidentType = "AbsentLearner" | "EarlyTermination" | "SafetyIssue" | "Misconduct" | "SupervisorChanged" | "WorksiteChanged" | "Other"

interface PartnerSupervisor {
  _id: string
  name: string
  email?: string
  phone?: string
}

interface AttendanceLogEntry {
  _id: string
  entryType: "Daily" | "Weekly"
  periodStart: string
  periodEnd: string
  startTime?: string
  endTime?: string
  hoursWorked: number
  tasksCompleted: string
  skillsDemonstrated?: string
  notes?: string
  learnerSignatureName?: string
  facilitatorComment?: string
  facilitatorName?: string
  facilitatorSignatureName?: string
  facilitatorSignedAt?: string
  supervisorSignatureName?: string
  status: "Pending" | "SignedOff" | "Rejected"
  supervisorComment?: string
  submittedSource: "Institution" | "Partner"
  submittedBy?: {
    _id: string
    name: string
    role: string
  } | null
  signedOffBy?: {
    _id: string
    name: string
    role: string
  } | null
  signedOffAt?: string | null
}

type AttendanceStatus = "Pending" | "SignedOff" | "Rejected"

interface PartnerAttendanceLog extends AttendanceLogEntry {
  learner: {
    _id: string
    name: string
    trackingId: string
    program?: string
  }
  placement: {
    _id: string
    companyName: string
    supervisorName?: string
    supervisorEmail?: string
  }
}

interface SupervisorPerformanceRow {
  supervisor: PartnerSupervisor
  placementsOwned: number
  overdueHours: number
  pendingEvaluations: number
  openSupport: number
  slaBreaches: number
  unreadMessages: number
  placements: Array<{
    placementId: string
    learnerName: string
    trackingId: string
    companyName: string
    overdueHours: boolean
    pendingEvaluation: boolean
    openSupport: number
    slaBreaches: number
    unreadMessages: number
  }>
}

interface UnassignedPerformanceSummary {
  placementsOwned: number
  overdueHours: number
  pendingEvaluations: number
  openSupport: number
  slaBreaches: number
  unreadMessages: number
}

const EVALUATION_METRIC_LABELS: Record<string, string> = {
  punctualityAndAttendance: "Punctuality & Attendance",
  technicalSkills: "Technical Skills",
  abilityToLearn: "Ability to Learn",
  teamworkAndCommunication: "Teamwork & Communication",
  initiativeAndProblemSolving: "Initiative & Problem Solving",
}

const ALL_STATUS = "__all_status"
const ALL_TYPES = "__all_types"

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
})

function formatDate(value?: string | null) {
  if (!value) return "Not available"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Not available" : DATE_FORMATTER.format(parsed)
}

function formatMonthYear(value?: string | null) {
  if (!value) return "Not available"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "Not available" : MONTH_YEAR_FORMATTER.format(parsed)
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start || !end) return "Not available"
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "Not available"
  return `${SHORT_DATE_FORMATTER.format(startDate)} - ${DATE_FORMATTER.format(endDate)}`
}

function getStatusBadgeClass(status: AttendanceLogEntry["status"]) {
  if (status === "SignedOff") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "Rejected") return "bg-red-100 text-red-700 border-red-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

export default function PartnerDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { authFetch, user } = useAuth()
  const [placements, setPlacements] = useState<PartnerPlacement[]>([])
  const [supervisors, setSupervisors] = useState<PartnerSupervisor[]>([])
  const [attendanceLogs, setAttendanceLogs] = useState<PartnerAttendanceLog[]>([])
  const [performanceRows, setPerformanceRows] = useState<SupervisorPerformanceRow[]>([])
  const [unassignedPerformance, setUnassignedPerformance] = useState<UnassignedPerformanceSummary | null>(null)
  const [supervisorDrafts, setSupervisorDrafts] = useState<Record<string, string>>({})
  const [actionQueue, setActionQueue] = useState<PartnerActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [evaluateOpen, setEvaluateOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [employerAgreementOpen, setEmployerAgreementOpen] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [logbookOpen, setLogbookOpen] = useState(false)
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [logbookEntries, setLogbookEntries] = useState<AttendanceLogEntry[]>([])
  const [evaluationDocuments, setEvaluationDocuments] = useState<Array<{
    _id: string
    url: string
    fileName: string
    fileType: string
    fileSize: number
    category: string
    uploadedBy: { _id: string; name: string }
    createdAt: string
  }>>([])
  const [evaluationDocumentsLoading, setEvaluationDocumentsLoading] = useState(false)
  const [selectedPlacement, setSelectedPlacement] = useState<PartnerPlacement | null>(null)
  const [editingAttendanceLog, setEditingAttendanceLog] = useState<PartnerAttendanceLog | null>(null)
  const [selectedEvaluationVersion, setSelectedEvaluationVersion] = useState<string>("latest")
  const [selectedLearner, setSelectedLearner] = useState<{ _id: string; name?: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("")
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("")
  const [attendanceTypeFilter, setAttendanceTypeFilter] = useState("")
  const [expandedPlacementId, setExpandedPlacementId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [attendanceActionTarget, setAttendanceActionTarget] = useState<{ log: PartnerAttendanceLog; action: "sign-off" | "reject" } | null>(null)
  const [attendanceActionComment, setAttendanceActionComment] = useState("")
  const [attendanceActionSignature, setAttendanceActionSignature] = useState("")
  const [attendanceActionSubmitting, setAttendanceActionSubmitting] = useState(false)
  const [agreementSubmitting, setAgreementSubmitting] = useState(false)
  const [supportSubmitting, setSupportSubmitting] = useState(false)
  const [incidentSubmitting, setIncidentSubmitting] = useState(false)
  const [supportDraft, setSupportDraft] = useState({
    subject: "",
    category: "Workflow" as TicketCategory,
    priority: "High" as TicketPriority,
    description: "",
  })
  const [incidentDraft, setIncidentDraft] = useState({
    incidentType: "AbsentLearner" as IncidentType,
    priority: "High" as TicketPriority,
    incidentDate: new Date().toISOString().slice(0, 10),
    subject: "",
    description: "",
  })
  const [employerAgreementDraft, setEmployerAgreementDraft] = useState({
    signerName: "",
    businessRepresentativeName: "",
    signatureName: "",
  })
  const placementView = searchParams.get("view") === "mine" ? "mine" : "all"

  const activePlacements = useMemo(
    () => placements.filter((placement) => placement.status === "Active"),
    [placements]
  )

  const historicalPlacements = useMemo(
    () => placements.filter((placement) => placement.status !== "Active"),
    [placements]
  )

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true)
      try {
        const attendanceParams = new URLSearchParams()
        if (attendanceStatusFilter) attendanceParams.set("status", attendanceStatusFilter)
        if (attendanceTypeFilter) attendanceParams.set("entryType", attendanceTypeFilter)

        const [placementsRes, queueRes, supervisorsRes, performanceRes, attendanceRes] = await Promise.all([
          authFetch("/api/partner-portal/placements?status=Active"),
          authFetch("/api/partner-portal/action-queue"),
          authFetch("/api/partner-portal/supervisors"),
          authFetch("/api/partner-portal/performance"),
          authFetch(`/api/attendance-logs?${attendanceParams.toString()}`),
        ])

        if (!placementsRes.ok || !queueRes.ok || !supervisorsRes.ok || !performanceRes.ok || !attendanceRes.ok) {
          throw new Error("Failed to load partner dashboard")
        }

        const [placementsData, queueData, supervisorsData, performanceData, attendanceData] = await Promise.all([
          placementsRes.json(),
          queueRes.json(),
          supervisorsRes.json(),
          performanceRes.json(),
          attendanceRes.json(),
        ])

        setPlacements(placementsData)
        setActionQueue(queueData)
        setSupervisors(supervisorsData)
        setPerformanceRows(performanceData.supervisors || [])
        setUnassignedPerformance(performanceData.unassignedSummary || null)
        setAttendanceLogs(Array.isArray(attendanceData) ? attendanceData : [])
      } catch (error) {
        console.error("Error fetching partner dashboard:", error)
        toast.error("Failed to load partner dashboard")
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [attendanceStatusFilter, attendanceTypeFilter, authFetch, refreshKey])

  const filteredAttendanceLogs = useMemo(() => {
    const query = attendanceSearchQuery.toLowerCase()
    return attendanceLogs.filter((log) => (
      log.learner.name.toLowerCase().includes(query) ||
      log.learner.trackingId.toLowerCase().includes(query) ||
      log.placement.companyName.toLowerCase().includes(query)
    ))
  }, [attendanceLogs, attendanceSearchQuery])

  const attendanceStats = useMemo(() => ({
    totalEntries: filteredAttendanceLogs.length,
    totalHours: filteredAttendanceLogs.reduce((sum, log) => sum + log.hoursWorked, 0),
    signedOffHours: filteredAttendanceLogs.filter((log) => log.status === "SignedOff").reduce((sum, log) => sum + log.hoursWorked, 0),
    pendingCount: filteredAttendanceLogs.filter((log) => log.status === "Pending").length,
  }), [filteredAttendanceLogs])

  const filteredPlacements = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return activePlacements.filter((placement) => {
      if (placementView === "mine" && placement.partnerSupervisor?._id && !placement.assignedToCurrentSupervisor) {
        return false
      }
      const fields = [
        placement.learner?.name || "",
        placement.learner?.trackingId || "",
        placement.learner?.program || "",
        placement.companyName || "",
        placement.institution || "",
      ]
      return fields.some((field) => field.toLowerCase().includes(query))
    })
  }, [activePlacements, placementView, searchQuery])

  useEffect(() => {
    if (filteredPlacements.length === 0) {
      setExpandedPlacementId(null)
      return
    }

    if (!expandedPlacementId || !filteredPlacements.some((placement) => placement._id === expandedPlacementId)) {
      setExpandedPlacementId(filteredPlacements[0]._id)
    }
  }, [expandedPlacementId, filteredPlacements])

  const stats = useMemo(() => ({
    activePlacements: activePlacements.length,
    assignedToMe: activePlacements.filter((placement) => placement.assignedToCurrentSupervisor).length,
    unassignedPlacements: activePlacements.filter((placement) => !placement.partnerSupervisor?._id).length,
    unreadMessages: activePlacements.reduce((sum, placement) => sum + (placement.unreadMessageCount || 0), 0),
    pendingEvaluations: activePlacements.filter((placement) => !placement.evaluationSubmitted).length,
    supportBacklog: activePlacements.reduce((sum, placement) => sum + (placement.openSupportCount || 0), 0),
  }), [activePlacements])

  const handleOpenEvaluation = (placement: PartnerPlacement) => {
    if (!placement.learner) return
    setSelectedPlacement(placement)
    setSelectedLearner({ _id: placement.learner._id, name: placement.learner.name })
    setEvaluateOpen(true)
  }

  const handleAttendanceSuccess = (result?: { offlineQueued?: boolean }) => {
    const wasEditing = Boolean(editingAttendanceLog)
    setAttendanceOpen(false)
    setEditingAttendanceLog(null)
    if (result?.offlineQueued) {
      toast.success(wasEditing ? "Attendance update saved offline. It will sync automatically." : "Attendance log saved offline. It will sync automatically.")
      return
    }
    setRefreshKey((prev) => prev + 1)
    toast.success(wasEditing ? "Attendance log updated" : "Attendance log saved")
  }

  const handleEditAttendance = (log: PartnerAttendanceLog) => {
    setEditingAttendanceLog(log)
    setAttendanceOpen(true)
  }

  const handleDeleteAttendance = async (id: string) => {
    setDeleteTarget(id)
  }

  const executeDeleteAttendance = async () => {
    if (!deleteTarget) return
    try {
      const res = await authFetch(`/api/attendance-logs/${deleteTarget}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to delete attendance log")
      setRefreshKey((prev) => prev + 1)
      toast.success("Attendance log deleted")
    } catch (error) {
      console.error("Error deleting attendance log:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete attendance log")
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleAttendancePartnerAction = (log: PartnerAttendanceLog, action: "sign-off" | "reject") => {
    setAttendanceActionTarget({ log, action })
    setAttendanceActionComment("")
    setAttendanceActionSignature(user?.name || "")
  }

  const executeAttendanceAction = async () => {
    if (!attendanceActionTarget) return
    const { log, action } = attendanceActionTarget
    if (action === "reject" && !attendanceActionComment.trim()) {
      toast.error("A reason is required when rejecting an attendance entry")
      return
    }
    if (!attendanceActionSignature.trim()) {
      toast.error("Supervisor signature name is required")
      return
    }
    setAttendanceActionSubmitting(true)
    try {
      const res = await authFetch(`/api/attendance-logs/${log._id}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorComment: attendanceActionComment, supervisorSignatureName: attendanceActionSignature }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update attendance log")
      setRefreshKey((prev) => prev + 1)
      toast.success(action === "sign-off" ? "Hours signed off" : "Hours returned for review")
      setAttendanceActionTarget(null)
    } catch (error) {
      console.error("Error updating attendance log:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update attendance log")
    } finally {
      setAttendanceActionSubmitting(false)
    }
  }

  const getAttendanceStatusBadge = (status: AttendanceStatus) => {
    if (status === "SignedOff") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Signed Off</Badge>
    if (status === "Rejected") return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
  }

  const handleOpenMessages = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setMessagesOpen(true)
  }

  const handleMessageCreated = useCallback(() => {
    setRefreshKey((prev) => prev + 1)
  }, [])

  const handleConversationRead = useCallback(() => {
    setRefreshKey((prev) => prev + 1)
  }, [])

  const handleOpenSupport = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setSupportDraft({
      subject: placement.learner ? `Support needed for ${placement.learner.name}` : "",
      category: "Workflow",
      priority: "High",
      description: "",
    })
    setSupportOpen(true)
  }

  const handleOpenReview = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setSelectedEvaluationVersion("latest")
    setReviewOpen(true)
  }

  const handleOpenLogbook = async (placement: PartnerPlacement) => {
    if (!placement.learner) return
    setSelectedPlacement(placement)
    setLogbookOpen(true)
    setLogbookLoading(true)

    try {
      const res = await authFetch(`/api/attendance-logs?placementId=${placement._id}`)
      if (!res.ok) throw new Error("Failed to load logbook entries")
      const data = await res.json()
      setLogbookEntries(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Error fetching logbook entries:", error)
      setLogbookEntries([])
      toast.error(error instanceof Error ? error.message : "Failed to load logbook entries")
    } finally {
      setLogbookLoading(false)
    }
  }

  const handleExportLogbook = () => {
    if (!selectedPlacement?.learner) {
      toast.error("Learner details are required to export the logbook")
      return
    }

    downloadWELLogbookPdf({
      learnerName: selectedPlacement.learner.name,
      learnerTrackingId: selectedPlacement.learner.trackingId,
      institution: selectedPlacement.institution,
      companyName: selectedPlacement.companyName,
      location: selectedPlacement.location,
      program: selectedPlacement.learner.program,
      studyYear: selectedPlacement.learner.year,
      startDate: selectedPlacement.startDate,
      endDate: selectedPlacement.endDate,
      evaluationSubmitted: selectedPlacement.evaluationSubmitted,
      evaluationScore: selectedPlacement.evaluation?.overallScore ?? null,
      evaluationStrengths: selectedPlacement.evaluation?.strengths,
      evaluationImprovements: selectedPlacement.evaluation?.areasForImprovement,
      entries: logbookEntries,
    })
  }

  const handleAssignSupervisor = async (placement: PartnerPlacement) => {
    const partnerSupervisorId = supervisorDrafts[placement._id] ?? placement.partnerSupervisor?._id ?? ""
    try {
      const res = await authFetch(`/api/partner-portal/placements/${placement._id}/supervisor`, {
        method: "PUT",
        body: JSON.stringify({ partnerSupervisorId: partnerSupervisorId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update placement supervisor")
      toast.success("Placement supervisor updated")
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error("Error updating placement supervisor:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update placement supervisor")
    }
  }

  const handleOpenEmployerAgreement = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setEmployerAgreementDraft({
      signerName: user?.name || placement.supervisorName || "",
      businessRepresentativeName: placement.companyName || "",
      signatureName: user?.name || "",
    })
    setEmployerAgreementOpen(true)
  }

  const handleSignEmployerAgreement = async () => {
    if (!selectedPlacement) return
    setAgreementSubmitting(true)
    try {
      const res = await authFetch(`/api/partner-portal/placements/${selectedPlacement._id}/employer-agreement-sign`, {
        method: "POST",
        body: JSON.stringify(employerAgreementDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to sign employer agreement")
      toast.success("Employer acknowledgement signed")
      setEmployerAgreementOpen(false)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error("Error signing employer agreement:", error)
      toast.error(error instanceof Error ? error.message : "Failed to sign employer agreement")
    } finally {
      setAgreementSubmitting(false)
    }
  }

  const handleDownloadAgreement = (placement: PartnerPlacement) => {
    if (!placement.learner) {
      toast.error("Learner details are required to export the agreement")
      return
    }

    downloadPlacementAgreementPdf({
      learnerName: placement.learner.name,
      learnerTrackingId: placement.learner.trackingId,
      program: placement.learner.program,
      studyYear: placement.learner.year,
      institution: placement.institution,
      companyName: placement.companyName,
      location: placement.location,
      startDate: placement.startDate,
      endDate: placement.endDate,
      supervisorName: placement.supervisorName || placement.partnerSupervisor?.name,
      supervisorPhone: placement.supervisorPhone,
      supervisorEmail: placement.supervisorEmail,
      employerAcknowledgement: {
        signed: Boolean(placement.agreementSummary?.employerSigned),
        signerName: placement.agreementSummary?.employerSignerName,
        businessName: placement.agreementSummary?.employerBusinessName || placement.companyName,
        signatureName: placement.agreementSummary?.employerSignatureName,
        signedAt: placement.agreementSummary?.employerSignedAt,
      },
      learnerAgreement: {
        signed: Boolean(placement.agreementSummary?.learnerSigned),
        learnerName: placement.agreementSummary?.learnerSignerName || placement.learner.name,
        signatureName: placement.agreementSummary?.learnerSignatureName,
        signedAt: placement.agreementSummary?.learnerSignedAt,
      },
    })
  }

  const handleOpenIncident = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setIncidentDraft({
      incidentType: "AbsentLearner",
      priority: "High",
      incidentDate: new Date().toISOString().slice(0, 10),
      subject: placement.learner ? `Incident reported for ${placement.learner.name}` : "",
      description: "",
    })
    setIncidentOpen(true)
  }

  const getEvaluationDraft = (placement: PartnerPlacement | null): EmployerEvaluationDraft | null => {
    if (!placement?.evaluation) return null
    const {
      evaluatorName,
      evaluatorPosition,
      metrics,
      overallScore,
      strengths,
      areasForImprovement,
      wouldHire,
      additionalComments,
    } = placement.evaluation

    return {
      evaluatorName,
      evaluatorPosition,
      metrics,
      overallScore,
      strengths,
      areasForImprovement,
      wouldHire,
      additionalComments,
    }
  }

  const getEvaluationDueLabel = (placement: PartnerPlacement | null) => {
    if (!placement) return null
    if (placement.evaluationSubmitted) {
      return "Evaluation already submitted for this placement."
    }
    if (placement.daysUntilEvaluationDue === null || placement.daysUntilEvaluationDue === undefined) {
      return "Evaluation due date is unavailable."
    }
    if (placement.daysUntilEvaluationDue < 0) {
      return `Evaluation overdue by ${Math.abs(placement.daysUntilEvaluationDue)} day(s).`
    }
    return `Evaluation due in ${placement.daysUntilEvaluationDue} day(s).`
  }

  const selectedEvaluation = useMemo(() => {
    if (!selectedPlacement?.evaluationHistory?.length) {
      return selectedPlacement?.evaluation || null
    }

    if (selectedEvaluationVersion === "latest") {
      return selectedPlacement.evaluation
    }

    return selectedPlacement.evaluationHistory.find((entry) => String(entry.version) === selectedEvaluationVersion) || selectedPlacement.evaluation
  }, [selectedEvaluationVersion, selectedPlacement])

  const logbookSummary = useMemo(() => {
    if (!selectedPlacement) {
      return {
        totalHours: 0,
        signedOffCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        latestMonthYear: "Not available",
      }
    }

    const sortedEntries = [...logbookEntries].sort((a, b) => (
      new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    ))
    const latestEntry = sortedEntries[sortedEntries.length - 1] || null

    return {
      totalHours: logbookEntries.reduce((sum, entry) => sum + (Number(entry.hoursWorked) || 0), 0),
      signedOffCount: logbookEntries.filter((entry) => entry.status === "SignedOff").length,
      pendingCount: logbookEntries.filter((entry) => entry.status === "Pending").length,
      rejectedCount: logbookEntries.filter((entry) => entry.status === "Rejected").length,
      latestMonthYear: latestEntry ? formatMonthYear(latestEntry.periodEnd || latestEntry.periodStart) : formatMonthYear(selectedPlacement.startDate),
    }
  }, [logbookEntries, selectedPlacement])

  useEffect(() => {
    const fetchEvaluationDocuments = async () => {
      if (!reviewOpen || !selectedEvaluation?._id) {
        setEvaluationDocuments([])
        return
      }

      setEvaluationDocumentsLoading(true)
      try {
        const res = await authFetch(`/api/documents?employerEvaluationId=${selectedEvaluation._id}`)
        if (!res.ok) throw new Error("Failed to fetch evaluation evidence")
        const data = await res.json()
        setEvaluationDocuments(data)
      } catch (error) {
        console.error("Error fetching evaluation documents:", error)
        toast.error("Failed to load evaluation evidence")
      } finally {
        setEvaluationDocumentsLoading(false)
      }
    }

    fetchEvaluationDocuments()
  }, [authFetch, refreshKey, reviewOpen, selectedEvaluation?._id])

  const handleCreateSupport = async () => {
    if (!selectedPlacement?.learner) return
    setSupportSubmitting(true)
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        body: JSON.stringify({
          ...supportDraft,
          learnerId: selectedPlacement.learner._id,
          placementId: selectedPlacement._id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to create support ticket")
      toast.success("Support ticket created")
      setSupportOpen(false)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error("Error creating support ticket:", error)
      toast.error(error instanceof Error ? error.message : "Failed to create support ticket")
    } finally {
      setSupportSubmitting(false)
    }
  }

  const handleCreateIncident = async () => {
    if (!selectedPlacement?.learner) return
    setIncidentSubmitting(true)
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: incidentDraft.subject,
          category: "Workflow",
          priority: incidentDraft.priority,
          description: incidentDraft.description,
          learnerId: selectedPlacement.learner._id,
          placementId: selectedPlacement._id,
          ticketType: "Incident",
          incidentType: incidentDraft.incidentType,
          incidentDate: incidentDraft.incidentDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to report incident")
      toast.success("Incident reported")
      setIncidentOpen(false)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error("Error reporting incident:", error)
      toast.error(error instanceof Error ? error.message : "Failed to report incident")
    } finally {
      setIncidentSubmitting(false)
    }
  }

  const severityStyles: Record<string, string> = {
    high: "bg-red-50 border-red-100 text-red-700",
    medium: "bg-amber-50 border-amber-100 text-amber-700",
    low: "bg-blue-50 border-blue-100 text-blue-700",
  }

  const updatePlacementView = (view: "all" | "mine") => {
    const next = new URLSearchParams(searchParams)
    if (view === "mine") {
      next.set("view", "mine")
    } else {
      next.delete("view")
    }
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={evaluateOpen} onOpenChange={setEvaluateOpen}>
        <DialogContent className="sm:max-w-[700px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Star className="h-6 w-6 text-[#FFB800]" />
              Evaluate {selectedLearner?.name}
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Submit employer feedback for this active placement.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2">
            {selectedLearner && selectedPlacement ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement</p>
                    <p className="font-bold text-gray-900 mt-2">{selectedPlacement.companyName}</p>
                    <p className="text-sm text-gray-600 mt-1">{selectedPlacement.location}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Institution</p>
                    <p className="font-bold text-gray-900 mt-2">{selectedPlacement.institution}</p>
                    <p className="text-sm text-gray-600 mt-1">{getEvaluationDueLabel(selectedPlacement)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Revision State</p>
                    <p className="font-bold text-gray-900 mt-2">
                      {selectedPlacement.evaluationHistory?.length ? `${selectedPlacement.evaluationHistory.length} revision(s)` : "First submission"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedPlacement.evaluationSubmitted ? "A new submission will create the next revision." : "No employer evaluation has been submitted yet."}
                    </p>
                  </div>
                </div>

                {selectedPlacement.evaluationSubmitted ? (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">An evaluation already exists for this learner.</p>
                      <p className="text-sm text-gray-600 mt-1">Review the latest version before submitting a revised evaluation.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-100"
                      onClick={() => {
                        setEvaluateOpen(false)
                        handleOpenReview(selectedPlacement)
                      }}
                    >
                      Review Current Evaluation
                    </Button>
                  </div>
                ) : null}

                <EmployerEvaluationForm
                  onSuccess={() => {
                    setEvaluateOpen(false)
                    setSelectedLearner(null)
                    setRefreshKey((prev) => prev + 1)
                  }}
                  learnerId={selectedLearner._id}
                  learnerName={selectedLearner.name}
                  placementSummary={{
                    companyName: selectedPlacement.companyName,
                    institution: selectedPlacement.institution,
                    dueLabel: getEvaluationDueLabel(selectedPlacement) || undefined,
                    previousVersion: selectedPlacement.evaluation?.version || null,
                  }}
                  initialData={getEvaluationDraft(selectedPlacement)}
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceOpen} onOpenChange={(open) => {
        setAttendanceOpen(open)
        if (!open) setEditingAttendanceLog(null)
      }}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="pt-6 px-6 pb-0">
            <DialogTitle className="text-gray-900">
              {editingAttendanceLog ? "Edit Attendance Log" : "New Attendance Log"}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Record daily or weekly placement hours directly from the partner workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <AttendanceLogForm
              onSuccess={handleAttendanceSuccess}
              initialData={editingAttendanceLog}
              presetLearnerId={selectedPlacement?.learner?._id}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="pt-6 px-6 pb-0">
            <DialogTitle>Raise Placement Support Issue</DialogTitle>
            <DialogDescription className="text-gray-500">
              Open a ticket linked to this learner and placement so the institution can follow up.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-5">
            <Input
              placeholder="Subject"
              value={supportDraft.subject}
              onChange={(e) => setSupportDraft((current) => ({ ...current, subject: e.target.value }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={supportDraft.category} onValueChange={(value) => setSupportDraft((current) => ({ ...current, category: value as TicketCategory }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Access">Access</SelectItem>
                  <SelectItem value="Data">Data</SelectItem>
                  <SelectItem value="Workflow">Workflow</SelectItem>
                  <SelectItem value="Training">Training</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={supportDraft.priority} onValueChange={(value) => setSupportDraft((current) => ({ ...current, priority: value as TicketPriority }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Describe the issue, action taken, and what support you need."
              value={supportDraft.description}
              onChange={(e) => setSupportDraft((current) => ({ ...current, description: e.target.value }))}
            />
            <Button className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={handleCreateSupport} disabled={supportSubmitting}>
              <LifeBuoy className="mr-2 h-4 w-4" />
              {supportSubmitting ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentOpen} onOpenChange={setIncidentOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="pt-6 px-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Report Placement Incident
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Log an operational incident or exception so the institution and support teams can follow up quickly.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-5">
            <Input
              placeholder="Subject"
              value={incidentDraft.subject}
              onChange={(e) => setIncidentDraft((current) => ({ ...current, subject: e.target.value }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select value={incidentDraft.incidentType} onValueChange={(value) => setIncidentDraft((current) => ({ ...current, incidentType: value as IncidentType }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Incident type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AbsentLearner">Absent learner</SelectItem>
                  <SelectItem value="EarlyTermination">Early termination</SelectItem>
                  <SelectItem value="SafetyIssue">Safety issue</SelectItem>
                  <SelectItem value="Misconduct">Misconduct</SelectItem>
                  <SelectItem value="SupervisorChanged">Supervisor changed</SelectItem>
                  <SelectItem value="WorksiteChanged">Worksite changed</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={incidentDraft.priority} onValueChange={(value) => setIncidentDraft((current) => ({ ...current, priority: value as TicketPriority }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={incidentDraft.incidentDate}
                onChange={(e) => setIncidentDraft((current) => ({ ...current, incidentDate: e.target.value }))}
              />
            </div>
            <Textarea
              placeholder="Describe what happened, who was affected, immediate actions taken, and what follow-up is needed."
              value={incidentDraft.description}
              onChange={(e) => setIncidentDraft((current) => ({ ...current, description: e.target.value }))}
            />
            <Button className="w-full rounded-xl bg-red-500 hover:bg-red-600 text-white" onClick={handleCreateIncident} disabled={incidentSubmitting}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              {incidentSubmitting ? "Submitting..." : "Submit Incident Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Star className="h-6 w-6 text-[#FFB800]" />
              Submitted Evaluation Review
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Review the current evaluation and any earlier revisions for this learner.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2">
            {selectedEvaluation ? (
              <div className="space-y-5">
                {selectedPlacement?.evaluationHistory && selectedPlacement.evaluationHistory.length > 1 ? (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">Revision History</p>
                    <Select value={selectedEvaluationVersion} onValueChange={setSelectedEvaluationVersion}>
                      <SelectTrigger className="rounded-xl bg-white border-gray-200">
                        <SelectValue placeholder="Select evaluation version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="latest">
                          Latest revision
                        </SelectItem>
                        {selectedPlacement.evaluationHistory.map((entry) => (
                          <SelectItem key={entry._id || entry.version} value={String(entry.version)}>
                            {`Version ${entry.version || 1} · ${new Date(entry.evaluationDate).toLocaleDateString()}${entry.isCurrent ? " · Current" : ""}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Evaluator</p>
                    <p className="font-bold text-gray-900 mt-2">{selectedEvaluation.evaluatorName}</p>
                    <p className="text-sm text-gray-600 mt-1">{selectedEvaluation.evaluatorPosition}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Submitted</p>
                    <p className="font-bold text-gray-900 mt-2">{new Date(selectedEvaluation.evaluationDate).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-600 mt-1">Overall score: {selectedEvaluation.overallScore}/5</p>
                    <p className="text-sm text-gray-600 mt-1">Version {selectedEvaluation.version || 1}{selectedEvaluation.isCurrent ? " · Current" : ""}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedEvaluation.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">{EVALUATION_METRIC_LABELS[key] || key}</p>
                      <p className="font-bold text-gray-900 mt-2">{value}/5</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {value >= 5 ? "Outstanding" : value >= 4 ? "Strong" : value >= 3 ? "Meets expectations" : value >= 2 ? "Needs improvement" : "At risk"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Strengths</p>
                  <p className="text-sm text-gray-700 mt-2">{selectedEvaluation.strengths}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Areas for Improvement</p>
                  <p className="text-sm text-gray-700 mt-2">{selectedEvaluation.areasForImprovement}</p>
                </div>
                {selectedEvaluation.additionalComments ? (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Additional Comments</p>
                    <p className="text-sm text-gray-700 mt-2">{selectedEvaluation.additionalComments}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={selectedEvaluation.wouldHire ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}>
                    {selectedEvaluation.wouldHire ? "Would Hire" : "Would Not Hire"}
                  </Badge>
                  {selectedPlacement ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => {
                        setReviewOpen(false)
                        handleOpenEvaluation(selectedPlacement)
                      }}
                    >
                      Create New Revision
                    </Button>
                  ) : null}
                </div>
                {selectedEvaluation._id ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Evaluation Evidence</p>
                      <p className="text-sm text-gray-600 mt-1">Attach supporting files such as signed forms, reports, or supplementary evaluation notes.</p>
                    </div>
                    <DocumentList documents={evaluationDocuments} onDelete={() => setRefreshKey((prev) => prev + 1)} loading={evaluationDocumentsLoading} />
                    <DocumentUpload
                      employerEvaluationId={selectedEvaluation._id}
                      learnerId={selectedPlacement?.learner?._id}
                      placementId={selectedPlacement?._id}
                      defaultCategory="Evaluation Evidence"
                      categories={["Evaluation Evidence", "Assessment Form", "Report", "Other"]}
                      onUploadSuccess={() => setRefreshKey((prev) => prev + 1)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-gray-500">No submitted evaluation is available for review.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={logbookOpen}
        onOpenChange={(open) => {
          setLogbookOpen(open)
          if (!open) {
            setLogbookEntries([])
            setLogbookLoading(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-[1080px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh] [&>button]:text-gray-500 [&>button]:bg-gray-100 hover:[&>button]:bg-gray-200 hover:[&>button]:text-gray-900">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <NotebookPen className="h-6 w-6 text-[#FFB800]" />
              WEL Learner Logbook
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Structured from the WEL weekly logbook template using the placement details and attendance logs already recorded in the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Export a formal copy of this learner's logbook.</p>
                <p className="text-sm text-gray-600 mt-1">The PDF uses the same live placement and attendance data shown in this dialog.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={handleExportLogbook}
                disabled={!selectedPlacement?.learner || logbookLoading}
              >
                <NotebookPen className="mr-2 h-4 w-4" />
                Export Logbook PDF
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Learner's Name</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.learner?.name || "Not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">TVET Provider</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.institution || "Not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Company & Region</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.companyName || "Not available"}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedPlacement?.location || "Location not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Qualification Level</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.learner?.program || "Not available"}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedPlacement?.learner?.year ? `Year ${selectedPlacement.learner.year}` : "Year not recorded"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Month & Year</p>
                <p className="font-bold text-gray-900 mt-2">{logbookSummary.latestMonthYear}</p>
                <p className="text-sm text-gray-600 mt-1">{formatDateRange(selectedPlacement?.startDate, selectedPlacement?.endDate)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-600">Total Hours</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{logbookSummary.totalHours}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-600">Signed Off</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{logbookSummary.signedOffCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-600">Pending Review</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{logbookSummary.pendingCount}</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-red-600">Rejected Entries</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{logbookSummary.rejectedCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-black text-gray-900">Learners' Weekly Training Logsheet</p>
                <p className="text-sm text-gray-600 mt-1">Each row below is mapped from the attendance register and supervisor review data already in the dashboard.</p>
              </div>
              {logbookLoading ? (
                <div className="p-10 text-center text-gray-500 font-medium">Loading logbook entries...</div>
              ) : logbookEntries.length === 0 ? (
                <div className="p-10 text-center text-gray-500 font-medium">
                  No attendance entries have been recorded for this placement yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-gray-500">
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Week</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Dates</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Total Time</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Tasks / Activities</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Skills Demonstrated</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...logbookEntries]
                        .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
                        .map((entry, index) => (
                          <tr key={entry._id} className="border-t border-gray-100 align-top">
                            <td className="px-4 py-4 font-bold text-gray-900 whitespace-nowrap">Week {index + 1}</td>
                            <td className="px-4 py-4 text-gray-700 min-w-[170px]">{formatDateRange(entry.periodStart, entry.periodEnd)}</td>
                            <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{entry.startTime || "--:--"} - {entry.endTime || "--:--"}</td>
                            <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{entry.entryType}</td>
                            <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{entry.hoursWorked} hrs</td>
                            <td className="px-4 py-4 text-gray-700 min-w-[260px] whitespace-pre-wrap">{entry.tasksCompleted}</td>
                            <td className="px-4 py-4 text-gray-700 min-w-[220px] whitespace-pre-wrap">{entry.skillsDemonstrated?.trim() || entry.notes?.trim() || "No skills captured."}</td>
                            <td className="px-4 py-4 min-w-[220px]">
                              <div className="space-y-2">
                                <Badge className={getStatusBadgeClass(entry.status)}>{entry.status}</Badge>
                                <p className="text-xs text-gray-500">Source: {entry.submittedSource}</p>
                                {entry.notes?.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.notes}</p> : null}
                                {entry.supervisorComment?.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.supervisorComment}</p> : null}
                                {entry.signedOffBy?.name ? (
                                  <p className="text-xs text-gray-500">
                                    Reviewed by {entry.signedOffBy.name} on {formatDate(entry.signedOffAt)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5 space-y-4">
              <div>
                <p className="text-sm font-black text-gray-900">Post-WEL Assessment Companion</p>
                <p className="text-sm text-gray-600 mt-1">
                  The original logbook template includes a facilitator checklist. The portal does not store every checklist answer directly, so this section shows system-backed evidence instead of guessed responses.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Attendance Compliance</p>
                  <div className="mt-3 flex items-start gap-2">
                    {logbookSummary.pendingCount === 0 && logbookEntries.length > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    )}
                    <p className="text-sm text-gray-700">
                      {logbookEntries.length === 0
                        ? "No weekly evidence submitted yet."
                        : logbookSummary.pendingCount === 0
                          ? "All current attendance entries have been reviewed or signed off."
                          : `${logbookSummary.pendingCount} attendance entr${logbookSummary.pendingCount === 1 ? "y is" : "ies are"} still awaiting review.`}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Supervisor Review Trail</p>
                  <div className="mt-3 flex items-start gap-2">
                    {logbookSummary.signedOffCount > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    )}
                    <p className="text-sm text-gray-700">
                      {logbookSummary.signedOffCount > 0
                        ? `${logbookSummary.signedOffCount} log entr${logbookSummary.signedOffCount === 1 ? "y has" : "ies have"} a recorded supervisor sign-off trail.`
                        : "No signed-off attendance entry has been recorded yet."}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Employer Evaluation</p>
                  <div className="mt-3 flex items-start gap-2">
                    {selectedPlacement?.evaluationSubmitted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    )}
                    <p className="text-sm text-gray-700">
                      {selectedPlacement?.evaluationSubmitted
                        ? `Latest employer evaluation score: ${selectedPlacement.evaluation?.overallScore || "N/A"} / 5.`
                        : "Employer evaluation has not been submitted yet for this placement."}
                    </p>
                  </div>
                </div>
              </div>
              {selectedPlacement?.evaluation ? (
                <div className="rounded-2xl border border-white bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Latest Evaluation Notes</p>
                  <p className="text-sm text-gray-700 mt-3">
                    Strengths: {selectedPlacement.evaluation.strengths}
                  </p>
                  <p className="text-sm text-gray-700 mt-2">
                    Improvement Areas: {selectedPlacement.evaluation.areasForImprovement}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
              <div>
                <p className="text-sm font-black text-gray-900">Signature Blocks</p>
                <p className="text-sm text-gray-600 mt-1">These values come directly from the attendance log capture flow and complete the formal logbook sections.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Learner Signature</p>
                  <p className="font-bold text-gray-900 mt-2">{logbookEntries[0]?.learnerSignatureName || selectedPlacement?.learner?.name || "Not captured"}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">WEL Facilitator</p>
                  <p className="font-bold text-gray-900 mt-2">{logbookEntries[0]?.facilitatorName || "Not captured"}</p>
                  <p className="text-sm text-gray-600 mt-1">Signature: {logbookEntries[0]?.facilitatorSignatureName || "Not captured"}</p>
                  <p className="text-sm text-gray-600 mt-1">Date: {formatDate(logbookEntries[0]?.facilitatorSignedAt)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">WEL Supervisor</p>
                  <p className="font-bold text-gray-900 mt-2">{logbookEntries[0]?.signedOffBy?.name || selectedPlacement?.supervisorName || "Not captured"}</p>
                  <p className="text-sm text-gray-600 mt-1">Signature: {logbookEntries[0]?.supervisorSignatureName || "Not captured"}</p>
                  <p className="text-sm text-gray-600 mt-1">Date: {formatDate(logbookEntries[0]?.signedOffAt)}</p>
                </div>
              </div>
              {logbookEntries[0]?.facilitatorComment?.trim() ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Facilitator Comments</p>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{logbookEntries[0].facilitatorComment}</p>
                </div>
              ) : null}
            </div>
            
            <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
              <Button type="button" variant="outline" className="rounded-xl px-8" onClick={() => setLogbookOpen(false)}>
                Close Logbook
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={employerAgreementOpen} onOpenChange={setEmployerAgreementOpen}>
        <DialogContent className="sm:max-w-[780px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-[#FFB800]" />
              Employer Acknowledgement
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Record the employer acknowledgement for this WEL arrangement.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2 space-y-5">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm text-gray-700">
                By signing, the employer confirms responsibility for occupational health and safety compliance, hazard identification and control, induction, supervision, safe systems of work, non-discrimination, workplace access for the TVET provider, incident reporting, and consultation before early termination of the WEL arrangement.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Employer signer name" value={employerAgreementDraft.signerName} onChange={(e) => setEmployerAgreementDraft((current) => ({ ...current, signerName: e.target.value }))} />
              <Input placeholder="Business / industry name" value={employerAgreementDraft.businessRepresentativeName} onChange={(e) => setEmployerAgreementDraft((current) => ({ ...current, businessRepresentativeName: e.target.value }))} />
              <Input placeholder="Type full name as signature" value={employerAgreementDraft.signatureName} onChange={(e) => setEmployerAgreementDraft((current) => ({ ...current, signatureName: e.target.value }))} />
            </div>
            <Button className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold" onClick={handleSignEmployerAgreement} disabled={agreementSubmitting}>
              <FileSignature className="mr-2 h-4 w-4" />
              {agreementSubmitting ? "Signing..." : "Sign Employer Acknowledgement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PlacementMessagesDialog
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        placementId={selectedPlacement?._id || null}
        authFetch={authFetch}
        currentUserId={user?._id}
        onMessageCreated={handleMessageCreated}
        onConversationRead={handleConversationRead}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Building2 className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Industry Partner Workspace
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">
            Welcome, {user?.name}. Manage active placements, communications, hours, and support from one workspace.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => navigate("/partner-history")}
          >
            View Placement History
          </Button>
          <div className="flex items-center gap-2 rounded-2xl bg-white border border-gray-200 p-1">
            <Button
              type="button"
              variant="ghost"
              className={`rounded-xl px-4 ${placementView === "all" ? "bg-gray-900 text-white hover:bg-gray-900 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
              onClick={() => updatePlacementView("all")}
            >
              All Placements
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={`rounded-xl px-4 ${placementView === "mine" ? "bg-sky-600 text-white hover:bg-sky-600 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
              onClick={() => updatePlacementView("mine")}
            >
              My Placements
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search learners, company, or institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 h-11 bg-white border-gray-200 rounded-xl w-full lg:w-80"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[...Array(5)].map((_, index) => <Card key={index} className="h-28 rounded-2xl animate-pulse bg-white border-none shadow-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3"><Briefcase className="h-5 w-5 text-emerald-600" /></div><p className="text-sm text-gray-500">Active Placements</p><p className="text-3xl font-black text-gray-900">{stats.activePlacements}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center mb-3"><UserCircle2 className="h-5 w-5 text-sky-600" /></div><p className="text-sm text-gray-500">Assigned to Me</p><p className="text-3xl font-black text-sky-600">{stats.assignedToMe}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3"><Users className="h-5 w-5 text-red-600" /></div><p className="text-sm text-gray-500">Unassigned</p><p className="text-3xl font-black text-red-600">{stats.unassignedPlacements}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3"><MessageSquare className="h-5 w-5 text-indigo-600" /></div><p className="text-sm text-gray-500">Unread Messages</p><p className="text-3xl font-black text-indigo-600">{stats.unreadMessages}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3"><Star className="h-5 w-5 text-amber-600" /></div><p className="text-sm text-gray-500">Pending Evaluations</p><p className="text-3xl font-black text-amber-600">{stats.pendingEvaluations}</p></CardContent></Card>
        </div>
      )}

      {!loading && historicalPlacements.length > 0 ? (
        <Card className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-gray-400">Archived & Completed Records</p>
              <p className="text-xl font-black text-gray-900 mt-2">{historicalPlacements.length} historical placement{historicalPlacements.length === 1 ? "" : "s"} preserved in partner history</p>
              <p className="text-sm text-gray-600 mt-1">Use the dedicated history page to review completed learners, terminated placements, and archived completion evidence.</p>
            </div>
            <Button type="button" className="rounded-xl bg-gray-900 hover:bg-gray-800 text-white" onClick={() => navigate("/partner-history")}>
              Open Partner History
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card data-help-id="partner-dashboard-action-queue" className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-black">Partner Action Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {loading ? (
            <div className="text-gray-400 font-medium py-8">
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
            </div>
          </div>
          ) : actionQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500 font-medium">
              No partner actions are currently due.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {actionQueue.map((item, index) => (
                <button
                  key={`${item.placementId}-${item.type}-${index}`}
                  type="button"
                  onClick={() => {
                    if (item.type === "Unread Messages") {
                      const placement = placements.find((entry) => entry._id === item.placementId)
                      if (placement) handleOpenMessages(placement)
                      return
                    }
                    navigate(item.actionUrl)
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors hover:shadow-md ${severityStyles[item.severity] || severityStyles.low}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest">{item.type}</p>
                      <p className="text-base font-black text-gray-900 mt-1">{item.learnerName}</p>
                      <p className="text-xs font-mono text-gray-500 mt-1">{item.trackingId}</p>
                    </div>
                    <Badge className={item.severity === "high" ? "bg-red-100 text-red-700 border-red-200" : "bg-white/80 text-gray-700 border-gray-200"}>
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{item.message}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-black">Supervisor Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0 space-y-4">
          {loading ? (
          <div className="py-8">
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
            </div>
          </div>
          ) : (
            <>
              {unassignedPerformance && unassignedPerformance.placementsOwned > 0 ? (
                <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-red-500">Unassigned Placements</p>
                      <p className="font-bold text-gray-900 mt-1">{unassignedPerformance.placementsOwned} placement(s) need an owner</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-white text-red-700 border-red-200">Overdue hours: {unassignedPerformance.overdueHours}</Badge>
                      <Badge className="bg-white text-red-700 border-red-200">Pending evaluations: {unassignedPerformance.pendingEvaluations}</Badge>
                      <Badge className="bg-white text-red-700 border-red-200">Unread messages: {unassignedPerformance.unreadMessages}</Badge>
                    </div>
                  </div>
                </div>
              ) : null}

              {performanceRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500 font-medium">
                  No supervisor performance data is available yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {performanceRows.map((row) => (
                    <div key={row.supervisor._id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-gray-900">{row.supervisor.name}</p>
                          <p className="text-sm text-gray-500 mt-1">{row.supervisor.email || "No email set"}</p>
                        </div>
                        <Badge className="bg-sky-100 text-sky-700 border-sky-200">{row.placementsOwned} placements</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Hours</p>
                          <p className="text-lg font-black text-red-600 mt-1">{row.overdueHours}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Evals</p>
                          <p className="text-lg font-black text-amber-600 mt-1">{row.pendingEvaluations}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Support</p>
                          <p className="text-lg font-black text-fuchsia-600 mt-1">{row.openSupport}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="text-xs text-gray-400 font-black uppercase tracking-wider">SLA</p>
                          <p className="text-lg font-black text-rose-600 mt-1">{row.slaBreaches}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-gray-100 p-3">
                          <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Unread</p>
                          <p className="text-lg font-black text-indigo-600 mt-1">{row.unreadMessages}</p>
                        </div>
                      </div>
                      {row.placements.length > 0 ? (
                        <div className="space-y-2">
                          {row.placements.slice(0, 3).map((placement) => (
                            <div key={placement.placementId} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-100 px-3 py-2">
                              <div>
                                <p className="text-sm font-bold text-gray-900">{placement.learnerName}</p>
                                <p className="text-xs text-gray-500">{placement.companyName} · {placement.trackingId}</p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {placement.overdueHours ? <Badge className="bg-red-100 text-red-700 border-red-200">Hours overdue</Badge> : null}
                                {placement.pendingEvaluation ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Evaluation pending</Badge> : null}
                                {placement.openSupport > 0 ? <Badge className="bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200">Support {placement.openSupport}</Badge> : null}
                                {placement.unreadMessages > 0 ? <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Unread {placement.unreadMessages}</Badge> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-[#FFB800]" />
              Attendance & Hours Register
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              The same attendance workflow available on the institution portal, replicated here for partner supervisors.
            </p>
          </div>
          <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold" onClick={() => { setSelectedPlacement(null); setEditingAttendanceLog(null); setAttendanceOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Record Hours
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4"><FileClock className="h-6 w-6 text-indigo-600" /></div><p className="text-sm font-medium text-gray-500">Entries</p><p className="text-3xl font-black text-gray-900">{attendanceStats.totalEntries}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4"><Clock3 className="h-6 w-6 text-blue-600" /></div><p className="text-sm font-medium text-gray-500">Logged Hours</p><p className="text-3xl font-black text-gray-900">{attendanceStats.totalHours}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4"><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div><p className="text-sm font-medium text-gray-500">Signed-Off Hours</p><p className="text-3xl font-black text-gray-900">{attendanceStats.signedOffHours}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-2xl"><CardContent className="p-6"><div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4"><AlertTriangle className="h-6 w-6 text-amber-600" /></div><p className="text-sm font-medium text-gray-500">Pending Sign-Off</p><p className="text-3xl font-black text-gray-900">{attendanceStats.pendingCount}</p></CardContent></Card>
        </div>

        <Card className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Search learner, tracking ID, or company..."
                value={attendanceSearchQuery}
                onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                className="bg-gray-50 border-gray-200 rounded-xl"
              />
              <Select value={attendanceStatusFilter || ALL_STATUS} onValueChange={(value) => setAttendanceStatusFilter(value === ALL_STATUS ? "" : value)}>
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUS}>All statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="SignedOff">Signed Off</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={attendanceTypeFilter || ALL_TYPES} onValueChange={(value) => setAttendanceTypeFilter(value === ALL_TYPES ? "" : value)}>
                <SelectTrigger className="bg-gray-50 border-gray-200 rounded-xl">
                  <SelectValue placeholder="All entry types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TYPES}>All entry types</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black text-gray-900">Hours Register</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : filteredAttendanceLogs.length === 0 ? (
              <div className="p-12 text-center">
                <ClipboardCheck className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No attendance logs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendanceLogs.map((log) => {
                    const canEdit = log.status !== "SignedOff" && log.submittedBy?._id === user?._id
                    const canSignOff = log.status !== "SignedOff" && log.submittedSource !== "Partner"
                    return (
                      <TableRow key={log._id}>
                        <TableCell><div><div className="font-bold text-gray-900">{log.learner.name}</div><div className="text-xs text-gray-500 font-mono">{log.learner.trackingId}</div></div></TableCell>
                        <TableCell><div className="font-medium text-gray-700">{formatDate(log.periodStart)}{log.entryType === "Weekly" ? ` to ${formatDate(log.periodEnd)}` : ""}</div></TableCell>
                        <TableCell><div className="text-sm text-gray-700 whitespace-nowrap">{log.startTime || "--:--"} to {log.endTime || "--:--"}</div></TableCell>
                        <TableCell>{log.placement.companyName}</TableCell>
                        <TableCell><span className="font-black text-gray-900">{log.hoursWorked}</span></TableCell>
                        <TableCell><Badge className="bg-slate-100 text-slate-700 border-slate-200">{log.entryType}</Badge></TableCell>
                        <TableCell><div className="space-y-1"><Badge className={log.submittedSource === "Partner" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-indigo-100 text-indigo-700 border-indigo-200"}>{log.submittedSource}</Badge>{log.submittedBy ? <div className="text-xs text-gray-500">{log.submittedBy.name} ({log.submittedBy.role})</div> : null}</div></TableCell>
                        <TableCell>{getAttendanceStatusBadge(log.status)}</TableCell>
                        <TableCell><div className="max-w-[220px]"><div className="font-medium text-gray-800">{log.placement.supervisorName || "Not set"}</div>{log.supervisorComment ? <div className="text-xs text-gray-500 mt-1 line-clamp-2">{log.supervisorComment}</div> : null}</div></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canEdit ? (
                              <>
                                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleEditAttendance(log)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteAttendance(log._id)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Delete
                                </Button>
                              </>
                            ) : null}
                            {canSignOff ? (
                              <>
                                <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleAttendancePartnerAction(log, "sign-off")}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Sign Off
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={() => handleAttendancePartnerAction(log, "reject")}>
                                  Return
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div data-help-id="partner-dashboard-placements" className="space-y-6">
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-[#FFB800]" />
          <h3 className="text-xl font-black text-gray-900">Active Placement Workspace</h3>
          {placementView === "mine" ? <Badge className="bg-sky-100 text-sky-700 border-sky-200">Showing placements assigned to you plus unassigned placements</Badge> : null}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}
          </div>
        ) : filteredPlacements.length === 0 ? (
          <div className="w-full text-center p-16 bg-white border border-dashed border-gray-300 rounded-2xl">
            <Briefcase className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-black text-gray-500 tracking-tight">No matching placements</h3>
            <p className="text-gray-400 mt-2 font-medium">Try a different search or wait for new learner assignments.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPlacements.map((placement) => (
              <Card key={placement._id} className="bg-white border-none shadow-xl rounded-2xl overflow-hidden">
                <button
                  type="button"
                  aria-expanded={expandedPlacementId === placement._id}
                  aria-controls={`placement-workspace-${placement._id}`}
                  className="w-full border-b border-gray-100 px-6 py-5 text-left transition hover:bg-gray-50/70"
                  onClick={() => setExpandedPlacementId((current) => current === placement._id ? null : placement._id)}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-xl font-black text-gray-900">
                        {placement.learner?.name || "Unassigned learner"}
                      </CardTitle>
                      <p className="mt-1 text-sm text-gray-500">
                        {placement.learner?.trackingId || "No tracking ID"} · {placement.learner?.program || "No program"} · {placement.companyName}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 xl:items-end">
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {placement.partnerSupervisor ? (
                          <Badge className={placement.assignedToCurrentSupervisor ? "bg-sky-100 text-sky-700 border-sky-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                            {placement.assignedToCurrentSupervisor ? "Assigned to you" : `Assigned: ${placement.partnerSupervisor.name}`}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200">No supervisor assigned</Badge>
                        )}
                        {placement.unreadMessageCount ? <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{placement.unreadMessageCount} unread</Badge> : null}
                        {placement.agreementSummary?.employerSigned ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Employer signed</Badge> : null}
                        {placement.agreementSummary?.learnerSigned ? <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Learner signed</Badge> : null}
                        {placement.evaluationSubmitted ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Evaluation completed</Badge> : null}
                        {placement.evaluationDueSoon && !placement.evaluationSubmitted ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Evaluation due soon</Badge> : null}
                        {!placement.operationalReadiness?.isOperational ? <Badge className="bg-red-100 text-red-700 border-red-200">Setup required</Badge> : null}
                      </div>
                      <div className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 xl:self-end">
                        {expandedPlacementId === placement._id ? "Hide workspace" : "Open workspace"}
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedPlacementId === placement._id ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                  </div>
                </button>
                {expandedPlacementId === placement._id ? (
                <CardContent id={`placement-workspace-${placement._id}`} className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement Site</p>
                      <p className="font-bold text-gray-900 mt-2">{placement.companyName}</p>
                      <p className="text-sm text-gray-600 mt-1">{placement.location}</p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Institution</p>
                      <p className="font-bold text-gray-900 mt-2">{placement.institution}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Owner: {placement.institutionOwner ? `${placement.institutionOwner.name} (${placement.institutionOwner.role})` : "Not assigned"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Supervisor</p>
                      <p className="font-bold text-gray-900 mt-2">{placement.supervisorName || "Missing supervisor name"}</p>
                      <p className="text-sm text-gray-600 mt-1">{placement.supervisorPhone || placement.supervisorEmail || "Missing supervisor contact"}</p>
                      <p className="text-sm text-gray-600 mt-2">
                        Assigned portal supervisor: {placement.partnerSupervisor ? placement.partnerSupervisor.name : "Not assigned"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement Dates</p>
                      <p className="font-bold text-gray-900 mt-2">{new Date(placement.startDate).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-600 mt-1">Ends {new Date(placement.endDate).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {placement.evaluationSubmitted
                          ? "Evaluation completed"
                          : placement.daysUntilEvaluationDue !== null && placement.daysUntilEvaluationDue !== undefined
                            ? `Evaluation due in ${Math.max(placement.daysUntilEvaluationDue, 0)} day(s)`
                            : "Evaluation due date unavailable"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 space-y-3">
                    {(() => {
                      const draftSupervisorId = supervisorDrafts[placement._id] ?? placement.partnerSupervisor?._id ?? ""
                      const savedSupervisorId = placement.partnerSupervisor?._id ?? ""
                      const assignmentDirty = draftSupervisorId !== savedSupervisorId
                      const assignmentLabel = draftSupervisorId
                        ? supervisors.find((supervisor) => supervisor._id === draftSupervisorId)?.name || "Selected supervisor"
                        : "Unassigned"

                      return (
                        <>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Portal Supervisor Ownership</p>
                      <p className="font-bold text-gray-900 mt-2">
                        {placement.partnerSupervisor ? placement.partnerSupervisor.name : "Assign a supervisor"}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Attendance recording, evaluation submission, and incident reporting are restricted to the assigned supervisor.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className={assignmentDirty ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}>
                          {assignmentDirty ? "Not yet saved" : "Saved"}
                        </Badge>
                        <Badge className="bg-white text-sky-700 border-sky-200">
                          Selection: {assignmentLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-2">
                      <Select
                        value={supervisorDrafts[placement._id] ?? placement.partnerSupervisor?._id ?? "__unassigned"}
                        onValueChange={(value) => setSupervisorDrafts((current) => ({ ...current, [placement._id]: value === "__unassigned" ? "" : value }))}
                      >
                        <SelectTrigger className="rounded-xl bg-white border-sky-200">
                          <SelectValue placeholder="Assign supervisor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned">Unassigned</SelectItem>
                          {supervisors.map((supervisor) => (
                            <SelectItem key={supervisor._id} value={supervisor._id}>
                              {supervisor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50"
                        onClick={() => handleAssignSupervisor(placement)}
                        disabled={!assignmentDirty}
                      >
                        {assignmentDirty ? "Save Assignment" : "Assignment Saved"}
                      </Button>
                    </div>
                        </>
                      )
                    })()}
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement Agreement</p>
                        <p className="font-bold text-gray-900 mt-2">
                          {placement.agreementSummary?.fullySigned ? "Both signatures complete" : "Agreement signatures pending"}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Employer acknowledgement: {placement.agreementSummary?.employerSigned ? "Signed" : "Pending"} · Learner agreement: {placement.agreementSummary?.learnerSigned ? "Signed" : "Pending"}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                        <Button
                          variant="outline"
                          className="rounded-xl w-full whitespace-normal h-auto py-2 text-left sm:text-center"
                          onClick={() => handleDownloadAgreement(placement)}
                        >
                          Export Agreement PDF
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-100 w-full whitespace-normal h-auto py-2 text-left sm:text-center"
                          onClick={() => handleOpenEmployerAgreement(placement)}
                          disabled={Boolean(placement.partnerSupervisor && !placement.assignedToCurrentSupervisor)}
                        >
                          <FileSignature className="mr-2 h-4 w-4" />
                          {placement.agreementSummary?.employerSigned ? "Update Employer Signature" : "Sign Employer Acknowledgement"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={() => placement.learner && navigate(`/attendance-logs?learnerId=${placement.learner._id}`)} disabled={Boolean(placement.partnerSupervisor && !placement.assignedToCurrentSupervisor)}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Record Hours
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenLogbook(placement)} disabled={!placement.learner}>
                      <NotebookPen className="mr-2 h-4 w-4" />
                      Open WEL Logbook
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenMessages(placement)}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Send Message
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenEvaluation(placement)} disabled={!placement.learner || Boolean(placement.partnerSupervisor && !placement.assignedToCurrentSupervisor)}>
                      <Star className="mr-2 h-4 w-4" />
                      {placement.evaluationSubmitted ? "Re-submit Evaluation" : "Submit Evaluation"}
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenSupport(placement)} disabled={!placement.learner || Boolean(placement.partnerSupervisor && !placement.assignedToCurrentSupervisor)}>
                      <LifeBuoy className="mr-2 h-4 w-4" />
                      Raise Support Issue
                    </Button>
                    <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => handleOpenIncident(placement)} disabled={!placement.learner || Boolean(placement.partnerSupervisor && !placement.assignedToCurrentSupervisor)}>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Report Incident
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Evaluation Status</p>
                        <p className="font-bold text-gray-900 mt-2">{placement.evaluationStatus || "Pending"}</p>
                      </div>
                      {placement.evaluationSubmitted ? (
                        <Button variant="outline" className="rounded-xl" onClick={() => handleOpenReview(placement)}>
                          {placement.evaluationHistory && placement.evaluationHistory.length > 1 ? "Review Evaluation History" : "Review Submitted Evaluation"}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Unread messages: {placement.unreadMessageCount || 0}</Badge>
                    <Badge variant="outline">Open support: {placement.openSupportCount || 0}</Badge>
                    {placement.learner ? <Badge variant="outline"><UserCircle2 className="mr-1 h-3 w-3" /> {placement.learner.name}</Badge> : null}
                  </div>
                </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Attendance Delete Confirmation */}
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Attendance Log"
        description="This attendance log entry will be permanently removed. This action cannot be undone."
        confirmLabel="Delete Log"
        variant="danger"
        onConfirm={executeDeleteAttendance}
      />

      {/* Attendance Sign-Off / Reject Dialog */}
      <Dialog open={Boolean(attendanceActionTarget)} onOpenChange={(open) => { if (!open) setAttendanceActionTarget(null) }}>
        <DialogContent className="sm:max-w-[520px] bg-white rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              {attendanceActionTarget?.action === "sign-off" ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Sign Off Hours</>
              ) : (
                <><XCircle className="h-5 w-5 text-red-500" /> Return Hours for Review</>
              )}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {attendanceActionTarget?.action === "sign-off"
                ? "Confirm these hours are accurate. Add an optional comment."
                : "Provide a reason for returning this entry. The institution will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            {attendanceActionTarget?.log ? (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="font-bold text-gray-900">{attendanceActionTarget.log.learner.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {attendanceActionTarget.log.learner.trackingId} · {attendanceActionTarget.log.hoursWorked} hours · {attendanceActionTarget.log.entryType}
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                {attendanceActionTarget?.action === "reject" ? "Reason (required)" : "Comment (optional)"}
              </label>
              <Textarea
                placeholder={attendanceActionTarget?.action === "reject" ? "Explain why this entry is being returned..." : "Add any notes for the institution..."}
                value={attendanceActionComment}
                onChange={(e) => setAttendanceActionComment(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Supervisor Signature</label>
              <Input
                placeholder="Type your full name as signature"
                value={attendanceActionSignature}
                onChange={(e) => setAttendanceActionSignature(e.target.value)}
              />
            </div>
            <Button
              className={`w-full rounded-xl font-bold ${
                attendanceActionTarget?.action === "sign-off"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
              }`}
              onClick={executeAttendanceAction}
              disabled={attendanceActionSubmitting}
            >
              {attendanceActionSubmitting
                ? "Processing..."
                : attendanceActionTarget?.action === "sign-off"
                  ? "Confirm Sign-Off"
                  : "Return for Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
