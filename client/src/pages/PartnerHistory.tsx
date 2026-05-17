import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Archive, ArrowRight, Briefcase, Building2, CalendarClock, CheckCircle2, MessageSquare, NotebookPen, Search, Star, UserCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlacementMessagesDialog } from "@/components/PlacementMessagesDialog"
import { downloadWELLogbookPdf } from "@/lib/welLogbookPdf"

interface PartnerPlacementHistoryRecord {
  _id: string
  status: "Active" | "Completed" | "Terminated"
  companyName: string
  location: string
  institution: string
  startDate?: string
  endDate?: string
  updatedAt?: string
  partnerSupervisor?: {
    _id: string
    name: string
  } | null
  assignedToCurrentSupervisor?: boolean
  evaluationSubmitted?: boolean
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
  openSupportCount?: number
  unreadMessageCount?: number
  closureMeta?: {
    closedAt?: string | null
    closedBy?: {
      _id: string
      name: string
      role?: string
    } | null
    closureReason?: string
    closureNote?: string
  } | null
  agreementSummary?: {
    fullySigned: boolean
    employerSigned: boolean
    learnerSigned: boolean
  }
  learner?: {
    _id: string
    name: string
    trackingId: string
    program: string
    year?: string
  } | null
  institutionOwner?: {
    _id: string
    name: string
    role: string
  } | null
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
  signedOffBy?: {
    _id: string
    name: string
    role: string
  } | null
  signedOffAt?: string | null
}

const ALL_ARCHIVE_STATUS = "__all_archive_status"
const EVALUATION_METRIC_LABELS: Record<string, string> = {
  punctualityAndAttendance: "Punctuality & Attendance",
  technicalSkills: "Technical Skills",
  abilityToLearn: "Ability to Learn",
  teamworkAndCommunication: "Teamwork & Communication",
  initiativeAndProblemSolving: "Initiative & Problem Solving",
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
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
  return `${DATE_FORMATTER.format(startDate)} - ${DATE_FORMATTER.format(endDate)}`
}

function getHistoryBadgeClass(status: PartnerPlacementHistoryRecord["status"]) {
  if (status === "Completed") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "Terminated") return "bg-red-100 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

function getStatusBadgeClass(status: AttendanceLogEntry["status"]) {
  if (status === "SignedOff") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "Rejected") return "bg-red-100 text-red-700 border-red-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

export default function PartnerHistory() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { authFetch, user } = useAuth()
  const [placements, setPlacements] = useState<PartnerPlacementHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPlacement, setSelectedPlacement] = useState<PartnerPlacementHistoryRecord | null>(null)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [logbookOpen, setLogbookOpen] = useState(false)
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [logbookEntries, setLogbookEntries] = useState<AttendanceLogEntry[]>([])
  const [selectedEvaluationVersion, setSelectedEvaluationVersion] = useState<string>("latest")

  const placementView = searchParams.get("view") === "mine" ? "mine" : "all"
  const statusFilter = searchParams.get("status") || ""

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      try {
        const res = await authFetch("/api/partner-portal/placements?mode=archived")
        if (!res.ok) throw new Error("Failed to load placement history")
        const data = await res.json()
        const placementData = Array.isArray(data) ? data : []
        setPlacements(placementData)
      } catch (error) {
        console.error("Error fetching partner history:", error)
        toast.error(error instanceof Error ? error.message : "Failed to load placement history")
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [authFetch])

  const filteredPlacements = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return placements.filter((placement) => {
      if (placementView === "mine" && placement.partnerSupervisor?._id && !placement.assignedToCurrentSupervisor) {
        return false
      }
      if (statusFilter && placement.status !== statusFilter) {
        return false
      }
      const searchableFields = [
        placement.learner?.name || "",
        placement.learner?.trackingId || "",
        placement.learner?.program || "",
        placement.companyName || "",
        placement.institution || "",
        placement.partnerSupervisor?.name || "",
      ]
      return searchableFields.some((field) => field.toLowerCase().includes(query))
    })
  }, [placementView, placements, searchQuery, statusFilter])

  const stats = useMemo(() => ({
    total: placements.length,
    completed: placements.filter((placement) => placement.status === "Completed").length,
    terminated: placements.filter((placement) => placement.status === "Terminated").length,
    evaluationsSubmitted: placements.filter((placement) => placement.evaluationSubmitted).length,
    fullySigned: placements.filter((placement) => placement.agreementSummary?.fullySigned).length,
  }), [placements])

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
      latestMonthYear: latestEntry ? formatMonthYear(latestEntry.periodEnd || latestEntry.periodStart) : formatMonthYear(selectedPlacement.endDate),
    }
  }, [logbookEntries, selectedPlacement])

  const updatePlacementView = (view: "all" | "mine") => {
    const next = new URLSearchParams(searchParams)
    if (view === "mine") {
      next.set("view", "mine")
    } else {
      next.delete("view")
    }
    setSearchParams(next, { replace: true })
  }

  const updateStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === ALL_ARCHIVE_STATUS) {
      next.delete("status")
    } else {
      next.set("status", value)
    }
    setSearchParams(next, { replace: true })
  }

  const handleOpenMessages = (placement: PartnerPlacementHistoryRecord) => {
    setSelectedPlacement(placement)
    setMessagesOpen(true)
  }

  const handleOpenReview = (placement: PartnerPlacementHistoryRecord) => {
    setSelectedPlacement(placement)
    setSelectedEvaluationVersion("latest")
    setReviewOpen(true)
  }

  const handleOpenLogbook = async (placement: PartnerPlacementHistoryRecord) => {
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

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Star className="h-6 w-6 text-[#FFB800]" />
              Archived Evaluation Review
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Review the final evaluation record and any earlier revisions attached to this archived placement.
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
                        <SelectItem value="latest">Latest revision</SelectItem>
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
                <div>
                  <Badge className={selectedEvaluation.wouldHire ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}>
                    {selectedEvaluation.wouldHire ? "Would Hire" : "Would Not Hire"}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No submitted evaluation is available for this archived placement.</p>
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
        <DialogContent className="sm:max-w-[1080px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh] [&>button]:text-gray-500 [&>button]:bg-gray-100 hover:[&>button]:bg-gray-200 hover:[&>button]:text-gray-900">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <NotebookPen className="h-6 w-6 text-[#FFB800]" />
              Archived WEL Learner Logbook
            </DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Review the attendance-backed logbook record for this archived placement and export a formal copy when needed.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Archived placement logbook</p>
                <p className="text-sm text-gray-600 mt-1">This copy is generated from the preserved placement and attendance records.</p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={handleExportLogbook} disabled={!selectedPlacement?.learner || logbookLoading}>
                <NotebookPen className="mr-2 h-4 w-4" />
                Export Logbook PDF
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Learner</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.learner?.name || "Not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Provider</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.institution || "Not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Company</p>
                <p className="font-bold text-gray-900 mt-2">{selectedPlacement?.companyName || "Not available"}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedPlacement?.location || "Location not available"}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Programme</p>
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

            <div className="rounded-[2rem] border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-black text-gray-900">Archived Training Logsheet</p>
                <p className="text-sm text-gray-600 mt-1">These entries are preserved as part of the placement history.</p>
              </div>
              {logbookLoading ? (
                <div className="p-10 text-center text-gray-500 font-medium">Loading logbook entries...</div>
              ) : logbookEntries.length === 0 ? (
                <div className="p-10 text-center text-gray-500 font-medium">No attendance entries were recorded for this placement.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-gray-500">
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Week</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Dates</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Hours</th>
                        <th className="px-4 py-3 font-black uppercase tracking-wider">Tasks</th>
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
                            <td className="px-4 py-4 min-w-[220px]">
                              <div className="space-y-2">
                                <Badge className={getStatusBadgeClass(entry.status)}>{entry.status}</Badge>
                                {entry.notes?.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.notes}</p> : null}
                                {entry.supervisorComment?.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.supervisorComment}</p> : null}
                                {entry.signedOffBy?.name ? (
                                  <p className="text-xs text-gray-500">Reviewed by {entry.signedOffBy.name} on {formatDate(entry.signedOffAt)}</p>
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
            
            <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
              <Button type="button" variant="outline" className="rounded-xl px-8" onClick={() => setLogbookOpen(false)}>
                Close Logbook
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlacementMessagesDialog
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        placementId={selectedPlacement?._id || null}
        authFetch={authFetch}
        currentUserId={user?._id}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Archive className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Partner Placement History
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">
            Review completed and terminated learner placements without mixing them into the active partner workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => navigate("/partner-dashboard")}
          >
            Active Workspace
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[...Array(5)].map((_, index) => <Card key={index} className="h-28 rounded-[2rem] animate-pulse bg-white border-none shadow-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Historical Placements</p><p className="text-3xl font-black text-gray-900">{stats.total}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Completed</p><p className="text-3xl font-black text-emerald-600">{stats.completed}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Terminated</p><p className="text-3xl font-black text-red-600">{stats.terminated}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Evaluations Filed</p><p className="text-3xl font-black text-amber-600">{stats.evaluationsSubmitted}</p></CardContent></Card>
          <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Fully Signed</p><p className="text-3xl font-black text-sky-600">{stats.fullySigned}</p></CardContent></Card>
        </div>
      )}

      <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto] gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search learner, tracking ID, company, institution, or supervisor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 h-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FFB800]/20 focus:border-[#FFB800] w-full"
              />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-gray-50 border border-gray-200 p-1">
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl px-4 ${placementView === "all" ? "bg-gray-900 text-white hover:bg-gray-900 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => updatePlacementView("all")}
              >
                All History
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl px-4 ${placementView === "mine" ? "bg-sky-600 text-white hover:bg-sky-600 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => updatePlacementView("mine")}
              >
                My History
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-gray-50 border border-gray-200 p-1">
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl px-4 ${!statusFilter ? "bg-gray-900 text-white hover:bg-gray-900 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => updateStatusFilter(ALL_ARCHIVE_STATUS)}
              >
                All Statuses
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl px-4 ${statusFilter === "Completed" ? "bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => updateStatusFilter("Completed")}
              >
                Completed
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl px-4 ${statusFilter === "Terminated" ? "bg-red-600 text-white hover:bg-red-600 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => updateStatusFilter("Terminated")}
              >
                Terminated
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-[#FFB800]" />
          <h3 className="text-xl font-black text-gray-900">Archived Partner Placements</h3>
          {placementView === "mine" ? <Badge className="bg-sky-100 text-sky-700 border-sky-200">Showing your historical placements plus unassigned records</Badge> : null}
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-48 rounded-[2rem]" />)}
          </div>
        ) : filteredPlacements.length === 0 ? (
          <div className="w-full text-center p-16 bg-white border border-dashed border-gray-300 rounded-[2.5rem]">
            <Archive className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-black text-gray-500 tracking-tight">No archived placements match this view</h3>
            <p className="text-gray-400 mt-2 font-medium">Completed and terminated partner records will appear here once active placements close out.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {filteredPlacements.map((placement) => (
              <Card key={placement._id} className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
                <CardHeader className="border-b border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-black text-gray-900">
                        {placement.learner?.name || "Archived learner record"}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {placement.learner?.trackingId || "No tracking ID"} · {placement.learner?.program || "Program not captured"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge className={getHistoryBadgeClass(placement.status)}>{placement.status}</Badge>
                      {placement.assignedToCurrentSupervisor ? <Badge className="bg-sky-100 text-sky-700 border-sky-200">Owned by you</Badge> : null}
                      {placement.evaluationSubmitted ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Evaluation on file</Badge> : null}
                      {placement.agreementSummary?.fullySigned ? <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Fully signed</Badge> : null}
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
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement Outcome</p>
                      <p className="font-bold text-gray-900 mt-2">{placement.status}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Closed on: {formatDate(placement.closureMeta?.closedAt || placement.updatedAt || placement.endDate)}
                      </p>
                      {placement.closureMeta?.closedBy?.name ? (
                        <p className="text-sm text-gray-600 mt-1">Closed by: {placement.closureMeta.closedBy.name}{placement.closureMeta.closedBy.role ? ` (${placement.closureMeta.closedBy.role})` : ""}</p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-400">Placement Window</p>
                      <p className="font-bold text-gray-900 mt-2">{formatDate(placement.startDate)}</p>
                      <p className="text-sm text-gray-600 mt-1">Ended {formatDate(placement.endDate)}</p>
                      <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Supervisor: {placement.partnerSupervisor?.name || "Not assigned"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                      <p className="text-xs text-emerald-600 font-black uppercase tracking-wider">Evaluation</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{placement.evaluationSubmitted ? "Submitted" : "Pending"}</p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
                      <p className="text-xs text-indigo-600 font-black uppercase tracking-wider">Agreement</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{placement.agreementSummary?.fullySigned ? "Complete" : "Partial / Pending"}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                      <p className="text-xs text-amber-600 font-black uppercase tracking-wider">Unread Messages</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{placement.unreadMessageCount || 0}</p>
                    </div>
                    <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                      <p className="text-xs text-rose-600 font-black uppercase tracking-wider">Open Support</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{placement.openSupportCount || 0}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Archive Notes</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-start gap-2">
                        {placement.status === "Completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        )}
                        <p className="text-sm text-gray-700">
                          {placement.closureMeta?.closureReason?.trim()
                            ? placement.closureMeta.closureReason
                            : placement.status === "Completed"
                              ? "This learner placement is completed and preserved as partner history."
                              : "This learner placement ended early and remains available as a terminated history record."}
                        </p>
                      </div>
                      {placement.closureMeta?.closureNote?.trim() ? (
                        <div className="flex items-start gap-2">
                          <Archive className="h-4 w-4 text-gray-500 mt-0.5" />
                          <p className="text-sm text-gray-700">{placement.closureMeta.closureNote}</p>
                        </div>
                      ) : null}
                      <div className="flex items-start gap-2">
                        <UserCircle2 className="h-4 w-4 text-sky-600 mt-0.5" />
                        <p className="text-sm text-gray-700">
                          {placement.partnerSupervisor
                            ? `Historical owner: ${placement.partnerSupervisor.name}.`
                            : "No partner supervisor was assigned when this record closed."}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 text-amber-600 mt-0.5" />
                        <p className="text-sm text-gray-700">
                          The archived record remains visible for audits, sign-off checks, evaluation review, and partner reporting.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenMessages(placement)}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Open Messages
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenLogbook(placement)} disabled={!placement.learner}>
                      <NotebookPen className="mr-2 h-4 w-4" />
                      Open Logbook
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleOpenReview(placement)} disabled={!placement.evaluationSubmitted}>
                      <Star className="mr-2 h-4 w-4" />
                      Review Evaluation
                    </Button>
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
