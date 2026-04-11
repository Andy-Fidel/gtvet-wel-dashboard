import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { AlertTriangle, Building2, Briefcase, CalendarClock, ClipboardList, FileSignature, LifeBuoy, MessageSquare, Search, Star, UserCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmployerEvaluationForm } from "./EmployerEvaluationForm"
import type { EmployerEvaluationDraft } from "./EmployerEvaluationForm"
import { PlacementMessagesDialog } from "@/components/PlacementMessagesDialog"
import { DocumentList } from "@/components/DocumentList"
import { DocumentUpload } from "@/components/DocumentUpload"
import { downloadPlacementAgreementPdf } from "@/lib/placementAgreementPdf"

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

export default function PartnerDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { authFetch, user } = useAuth()
  const [placements, setPlacements] = useState<PartnerPlacement[]>([])
  const [supervisors, setSupervisors] = useState<PartnerSupervisor[]>([])
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
  const [selectedEvaluationVersion, setSelectedEvaluationVersion] = useState<string>("latest")
  const [selectedLearner, setSelectedLearner] = useState<{ _id: string; name?: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
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

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true)
      try {
        const [placementsRes, queueRes, supervisorsRes, performanceRes] = await Promise.all([
          authFetch("/api/partner-portal/placements"),
          authFetch("/api/partner-portal/action-queue"),
          authFetch("/api/partner-portal/supervisors"),
          authFetch("/api/partner-portal/performance"),
        ])

        if (!placementsRes.ok || !queueRes.ok || !supervisorsRes.ok || !performanceRes.ok) {
          throw new Error("Failed to load partner dashboard")
        }

        const [placementsData, queueData, supervisorsData, performanceData] = await Promise.all([
          placementsRes.json(),
          queueRes.json(),
          supervisorsRes.json(),
          performanceRes.json(),
        ])

        setPlacements(placementsData)
        setActionQueue(queueData)
        setSupervisors(supervisorsData)
        setPerformanceRows(performanceData.supervisors || [])
        setUnassignedPerformance(performanceData.unassignedSummary || null)
      } catch (error) {
        console.error("Error fetching partner dashboard:", error)
        toast.error("Failed to load partner dashboard")
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [authFetch, refreshKey])

  const filteredPlacements = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return placements.filter((placement) => {
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
  }, [placementView, placements, searchQuery])

  const stats = useMemo(() => ({
    activePlacements: placements.length,
    assignedToMe: placements.filter((placement) => placement.assignedToCurrentSupervisor).length,
    unassignedPlacements: placements.filter((placement) => !placement.partnerSupervisor?._id).length,
    unreadMessages: placements.reduce((sum, placement) => sum + (placement.unreadMessageCount || 0), 0),
    pendingEvaluations: placements.filter((placement) => !placement.evaluationSubmitted).length,
    supportBacklog: placements.reduce((sum, placement) => sum + (placement.openSupportCount || 0), 0),
  }), [placements])

  const handleOpenEvaluation = (placement: PartnerPlacement) => {
    if (!placement.learner) return
    setSelectedPlacement(placement)
    setSelectedLearner({ _id: placement.learner._id, name: placement.learner.name })
    setEvaluateOpen(true)
  }

  const handleOpenMessages = (placement: PartnerPlacement) => {
    setSelectedPlacement(placement)
    setMessagesOpen(true)
  }

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
    }
  }

  const handleCreateIncident = async () => {
    if (!selectedPlacement?.learner) return
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
        <DialogContent className="sm:max-w-[700px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
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

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
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
            <Button className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={handleCreateSupport}>
              <LifeBuoy className="mr-2 h-4 w-4" />
              Submit Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentOpen} onOpenChange={setIncidentOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
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
            <Button className="w-full rounded-xl bg-red-500 hover:bg-red-600 text-white" onClick={handleCreateIncident}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Submit Incident Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
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

      <Dialog open={employerAgreementOpen} onOpenChange={setEmployerAgreementOpen}>
        <DialogContent className="sm:max-w-[780px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
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
            <Button className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold" onClick={handleSignEmployerAgreement}>
              <FileSignature className="mr-2 h-4 w-4" />
              Sign Employer Acknowledgement
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
        onMessageCreated={() => setRefreshKey((prev) => prev + 1)}
        onConversationRead={() => setRefreshKey((prev) => prev + 1)}
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
            <input
              type="text"
              placeholder="Search learners, company, or institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 h-11 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FFB800]/20 focus:border-[#FFB800] w-full lg:w-80"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[...Array(5)].map((_, index) => <Card key={index} className="h-28 rounded-[2rem] animate-pulse bg-white border-none shadow-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Active Placements</p><p className="text-3xl font-black text-gray-900">{stats.activePlacements}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Assigned to Me</p><p className="text-3xl font-black text-sky-600">{stats.assignedToMe}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Unassigned</p><p className="text-3xl font-black text-red-600">{stats.unassignedPlacements}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Unread Messages</p><p className="text-3xl font-black text-indigo-600">{stats.unreadMessages}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Pending Evaluations</p><p className="text-3xl font-black text-amber-600">{stats.pendingEvaluations}</p></CardContent></Card>
        </div>
      )}

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-black">Partner Action Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {loading ? (
            <div className="text-gray-400 font-medium py-8">Loading action queue...</div>
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

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-black">Supervisor Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0 space-y-4">
          {loading ? (
            <div className="text-gray-400 font-medium py-8">Loading supervisor performance...</div>
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
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-[#FFB800]" />
          <h3 className="text-xl font-black text-gray-900">Active Placement Workspace</h3>
          {placementView === "mine" ? <Badge className="bg-sky-100 text-sky-700 border-sky-200">Showing placements assigned to you plus unassigned placements</Badge> : null}
        </div>

        {loading ? (
          <div className="text-gray-400 font-medium py-8">Loading placements...</div>
        ) : filteredPlacements.length === 0 ? (
          <div className="w-full text-center p-16 bg-white border border-dashed border-gray-300 rounded-[2.5rem]">
            <Briefcase className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-black text-gray-500 tracking-tight">No matching placements</h3>
            <p className="text-gray-400 mt-2 font-medium">Try a different search or wait for new learner assignments.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {filteredPlacements.map((placement) => (
              <Card key={placement._id} className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
                <CardHeader className="border-b border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-black text-gray-900">
                        {placement.learner?.name || "Unassigned learner"}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {placement.learner?.trackingId || "No tracking ID"} · {placement.learner?.program || "No program"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
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
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
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
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Portal Supervisor Ownership</p>
                      <p className="font-bold text-gray-900 mt-2">
                        {placement.partnerSupervisor ? placement.partnerSupervisor.name : "Assign a supervisor"}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Attendance recording, evaluation submission, and incident reporting are restricted to the assigned supervisor.
                      </p>
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
                      <Button variant="outline" className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => handleAssignSupervisor(placement)}>
                        Save Assignment
                      </Button>
                    </div>
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
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => handleDownloadAgreement(placement)}
                        >
                          Export Agreement PDF
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-100"
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
