import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { AlertTriangle, ArrowUpRight, BookOpen, ChevronDown, CircleHelp, Headset, LifeBuoy, MessageSquarePlus, SendHorizonal, ShieldAlert, Ticket, UserPlus } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { DocumentList } from "@/components/DocumentList"
import { DocumentUpload } from "@/components/DocumentUpload"
import { clearDraft, loadDraft, saveDraft } from "@/lib/offlineDrafts"
import { clearOfflineConflictBridge, getOfflineConflictBridge } from "@/lib/offlineConflictBridge"

type RoleKey = "SuperAdmin" | "RegionalAdmin" | "Admin" | "Manager" | "Staff" | "IndustryPartner" | "Guardian"
type TicketStatus = "Open" | "InProgress" | "Resolved" | "Closed"
type TicketCategory = "Technical" | "Access" | "Data" | "Workflow" | "Training" | "Other"
type TicketPriority = "Low" | "Medium" | "High" | "Urgent"

interface SupportReply {
  _id: string
  message: string
  createdByName: string
  createdByRole: string
  createdAt: string
}

interface SupportTicket {
  _id: string
  subject: string
  ticketType?: "Support" | "Incident"
  category: TicketCategory
  priority: TicketPriority
  description: string
  incidentType?: "AbsentLearner" | "EarlyTermination" | "SafetyIssue" | "Misconduct" | "SupervisorChanged" | "WorksiteChanged" | "Other"
  incidentDate?: string
  status: TicketStatus
  createdAt: string
  updatedAt: string
  requesterRole: string
  requester: {
    _id: string
    name: string
    email: string
    role: string
    institution?: string
  }
  learner?: {
    _id: string
    name: string
    trackingId?: string
  }
  placement?: {
    _id: string
    companyName: string
    status: string
  }
  assignedTo?: {
    _id: string
    name: string
    role: string
  }
  escalatedTo?: {
    _id: string
    name: string
    role: string
  }
  escalationLevel?: "None" | "Regional" | "HQ"
  awaitingParty?: "Institution" | "Partner" | "Support" | "Requester" | "None"
  escalationReason?: string
  escalatedAt?: string
  firstResponseDueAt?: string
  resolutionDueAt?: string
  slaStatus?: {
    firstResponseBreached: boolean
    resolutionBreached: boolean
    hasBreach: boolean
  }
  hasUnreadChanges?: boolean
  isOwnedByCurrentUser?: boolean
  lastReadAt?: string | null
  replies: SupportReply[]
  documents?: Array<{
    _id: string
    url: string
    fileName: string
    fileType: string
    fileSize: number
    category: string
    uploadedBy: { _id: string; name: string }
    createdAt: string
  }>
}

interface SupportAssignee {
  _id: string
  name: string
  role: string
  institution?: string
}

const ALL_STATUSES = "__all_statuses"
const ALL_QUEUE_VIEWS = "__all_queue_views"
const NEW_TICKET_DRAFT_KEY = "draft:support:new-ticket"

const ROLE_GUIDES: Record<RoleKey, Array<{ title: string; summary: string; steps: string[] }>> = {
  SuperAdmin: [
    { title: "Oversee the full WEL network", summary: "Use overview dashboards, support tickets, and academic calendar controls to steer the platform.", steps: ["Review system overview weekly.", "Resolve escalated support tickets.", "Update academic calendar milestones before each term."] },
    { title: "Manage platform governance", summary: "Set the operating rules for regions, institutions, and partner workflows.", steps: ["Verify user roles before account creation.", "Monitor approval bottlenecks across regions.", "Close resolved support tickets to keep the queue clean."] },
  ],
  RegionalAdmin: [
    { title: "Monitor institutions in your region", summary: "Use semester reports, partner records, and support tickets to unblock institutions quickly.", steps: ["Track pending semester approvals.", "Review partner capacity for your region.", "Respond to institution support tickets tied to your region."] },
    { title: "Escalate only when necessary", summary: "Handle regional issues locally first, then escalate cross-region or platform problems.", steps: ["Confirm issue scope with the institution.", "Reply in the support ticket with actions taken.", "Escalate unresolved platform issues to HQ."] },
  ],
  Admin: [
    { title: "Run institution workflows", summary: "Manage learners, placements, attendance, monitoring, and reporting from one workspace.", steps: ["Register learners with complete profile data.", "Create placements before logging visits or hours.", "Check progress dashboard for at-risk learners weekly."] },
    { title: "Use support tickets effectively", summary: "Create clear tickets when your institution hits blockers that need regional or HQ action.", steps: ["Choose the closest ticket category.", "Include the learner, page, and action that failed.", "Reply on the ticket instead of opening duplicates."] },
  ],
  Manager: [
    { title: "Coordinate day-to-day WEL activity", summary: "Focus on placement operations, progress review, and data quality.", steps: ["Review attendance and sign-off gaps.", "Log monitoring visits on schedule.", "Use support tickets for workflow issues you cannot resolve locally."] },
    { title: "Keep learner records current", summary: "Accurate placement and hours data improves reporting and escalation.", steps: ["Update learner status changes promptly.", "Verify supervisor details on placements.", "Check rejected support items and address requested corrections."] },
  ],
  Staff: [
    { title: "Execute operational data entry", summary: "Log hours, visits, and supporting records carefully so approvals and reports stay accurate.", steps: ["Enter attendance daily or weekly as directed.", "Verify tracking IDs before submission.", "Use support tickets when blocked by access or system issues."] },
    { title: "Work from the learner profile", summary: "Most operational actions can start from a learner’s profile.", steps: ["Open the learner profile.", "Use quick actions for placement, visits, assessments, or hours.", "Check progress tracker after major updates."] },
  ],
  IndustryPartner: [
    { title: "Review assigned learners", summary: "Use the partner portal to review learners, sign off hours, and submit evaluations.", steps: ["Open the partner dashboard.", "Review pending hours in Support & Hours workflows.", "Submit employer evaluations before placement end dates."] },
    { title: "Raise support issues quickly", summary: "Use tickets for portal access, sign-off issues, or learner workflow questions.", steps: ["Create a support ticket with the learner and date range affected.", "Reply on the same ticket when support asks follow-up questions.", "Close the ticket once the issue is resolved."] },
  ],
  Guardian: [
    { title: "Track learner progress safely", summary: "Use the guardian portal to review placement details, attendance summaries, assessments, and notifications for linked learners.", steps: ["Open the guardian dashboard.", "Review current placement and attendance summaries.", "Check alerts for new updates or issues."] },
    { title: "Use concerns as your messaging channel", summary: "Submit a concern when you need institution help, then continue the conversation in the same thread.", steps: ["Select the learner involved.", "Describe the issue clearly and submit it.", "Reply inside the same concern thread when staff respond."] },
  ],
}

const FAQS = [
  { question: "Who can see my support tickets?", answer: "Institution users see tickets for their institution, regional admins see tickets in their region, superadmins see all tickets, and industry partners see their own company-linked tickets." },
  { question: "When should I use a support ticket instead of a notification?", answer: "Use notifications for awareness. Use support tickets when you need action, investigation, or a back-and-forth response thread." },
  { question: "What should I include in a good ticket?", answer: "Describe the page, the action you tried, the learner or partner involved, the exact error if any, and what outcome you expected." },
  { question: "Can I close a ticket myself?", answer: "Yes. The requester can close a ticket when the issue is resolved, even if the resolution came from a reply." },
  { question: "How do I get faster help?", answer: "Choose the right category, set the correct priority, and avoid duplicate tickets for the same issue." },
]

export default function SupportCenter() {
  const { authFetch, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [assignees, setAssignees] = useState<SupportAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({})
  const [escalationDrafts, setEscalationDrafts] = useState<Record<string, { escalatedTo: string; escalationLevel: "None" | "Regional" | "HQ"; escalationReason: string }>>({})
  const [statusFilter, setStatusFilter] = useState("")
  const [queueView, setQueueView] = useState("")
  const [newTicket, setNewTicket] = useState({
    subject: "",
    category: "Technical" as TicketCategory,
    priority: "Medium" as TicketPriority,
    description: "",
  })
  const deepLinkedTicketId = searchParams.get("ticket")?.trim() || ""
  const composeOfflineReview = searchParams.get("compose") === "1" || searchParams.get("offlineReview") === "1"
  const replyOfflineReview = searchParams.get("offlineReply") === "1"
  const [activeTab, setActiveTab] = useState(deepLinkedTicketId ? "tickets" : "guides")

  const role = (user?.role || "Staff") as RoleKey
  const canManageTickets = role === "SuperAdmin" || role === "RegionalAdmin" || role === "Admin"
  const isHQ = role === "SuperAdmin"

  useEffect(() => {
    const draft = loadDraft<typeof newTicket>(NEW_TICKET_DRAFT_KEY)
    if (draft) {
      setNewTicket({
        subject: draft.subject || "",
        category: draft.category || "Technical",
        priority: draft.priority || "Medium",
        description: draft.description || "",
      })
    }
  }, [])

  useEffect(() => {
    if (newTicket.subject || newTicket.description) {
      saveDraft(NEW_TICKET_DRAFT_KEY, newTicket)
    } else {
      clearDraft(NEW_TICKET_DRAFT_KEY)
    }
  }, [newTicket])

  useEffect(() => {
    Object.entries(replyDrafts).forEach(([ticketId, draft]) => {
      const key = `draft:support:reply:${ticketId}`
      if (draft?.trim()) saveDraft(key, draft)
      else clearDraft(key)
    })
  }, [replyDrafts])

  const fetchTickets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)
      const res = await authFetch(`/api/support-tickets?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch support tickets")
      const data = await res.json()
      setTickets(data)
    } catch (error) {
      console.error("Error fetching support tickets:", error)
      toast.error("Failed to load support tickets")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [statusFilter])

  useEffect(() => {
    if (deepLinkedTicketId) {
      setActiveTab("tickets")
    }
  }, [deepLinkedTicketId])

  useEffect(() => {
    if (!composeOfflineReview && !replyOfflineReview) return
    const bridge = getOfflineConflictBridge()
    if (!bridge) return

    if (composeOfflineReview && bridge.type === "support-ticket") {
      setNewTicket({
        subject: typeof bridge.payload.subject === "string" ? bridge.payload.subject : "",
        category: (bridge.payload.category as TicketCategory) || "Technical",
        priority: (bridge.payload.priority as TicketPriority) || "Medium",
        description: typeof bridge.payload.description === "string" ? bridge.payload.description : "",
      })
      setTicketOpen(true)
      setActiveTab("tickets")
    }

    if (replyOfflineReview && bridge.type === "support-reply" && bridge.ticketId) {
      setReplyDrafts((drafts) => ({
        ...drafts,
        [bridge.ticketId!]: typeof bridge.payload.message === "string" ? bridge.payload.message : "",
      }))
      setActiveTab("tickets")
    }
  }, [composeOfflineReview, replyOfflineReview])

  useEffect(() => {
    if (!canManageTickets) return
    authFetch("/api/support-tickets/assignees")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch support assignees")
        return res.json()
      })
      .then(setAssignees)
      .catch((error) => {
        console.error("Error fetching support assignees:", error)
      })
  }, [authFetch, canManageTickets])

  useEffect(() => {
    if (!tickets.length) return
    setReplyDrafts((current) => {
      const next = { ...current }
      for (const ticket of tickets) {
        if (next[ticket._id] !== undefined) continue
        const savedDraft = loadDraft<string>(`draft:support:reply:${ticket._id}`)
        if (savedDraft) {
          next[ticket._id] = savedDraft
        }
      }
      return next
    })
  }, [tickets])

  const visibleGuides = ROLE_GUIDES[role] || ROLE_GUIDES.Staff

  const awaitingCurrentUser = (ticket: SupportTicket) => {
    if (ticket.awaitingParty === "Support") {
      return canManageTickets || ticket.isOwnedByCurrentUser
    }
    if (ticket.awaitingParty === "Partner") {
      return role === "IndustryPartner"
    }
    if (ticket.awaitingParty === "Institution") {
      return role === "Admin" || role === "Manager" || role === "Staff"
    }
    if (ticket.awaitingParty === "Requester") {
      return ticket.requester._id === user?._id
    }
    return false
  }

  const visibleTickets = useMemo(() => {
    let filteredTickets = tickets

    if (queueView === "new") {
      filteredTickets = tickets.filter((ticket) => ticket.hasUnreadChanges)
    } else if (queueView === "owned") {
      filteredTickets = tickets.filter((ticket) => ticket.isOwnedByCurrentUser)
    } else if (queueView === "awaiting") {
      filteredTickets = tickets.filter(awaitingCurrentUser)
    }

    if (!deepLinkedTicketId) {
      return filteredTickets
    }

    if (filteredTickets.some((ticket) => ticket._id === deepLinkedTicketId)) {
      return filteredTickets
    }

    const deepLinkedTicket = tickets.find((ticket) => ticket._id === deepLinkedTicketId)
    return deepLinkedTicket ? [deepLinkedTicket, ...filteredTickets] : filteredTickets
  }, [deepLinkedTicketId, queueView, tickets, user?._id])

  useEffect(() => {
    if (!deepLinkedTicketId || loading || activeTab !== "tickets") return

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(`support-ticket-${deepLinkedTicketId}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, deepLinkedTicketId, loading, visibleTickets.length])

  const ticketStats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "Open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "InProgress").length,
    resolved: tickets.filter((ticket) => ticket.status === "Resolved").length,
    breached: tickets.filter((ticket) => ticket.slaStatus?.hasBreach).length,
    escalated: tickets.filter((ticket) => ticket.escalationLevel && ticket.escalationLevel !== "None").length,
    unread: tickets.filter((ticket) => ticket.hasUnreadChanges).length,
    ownedByMe: tickets.filter((ticket) => ticket.isOwnedByCurrentUser).length,
  }), [tickets])

  const hqQueueStats = useMemo(() => ({
    awaitingSupport: tickets.filter((ticket) => ticket.awaitingParty === "Support").length,
    urgent: tickets.filter((ticket) => ticket.priority === "Urgent").length,
    unassigned: tickets.filter((ticket) => !ticket.assignedTo?._id).length,
    incidents: tickets.filter((ticket) => ticket.ticketType === "Incident").length,
  }), [tickets])

  const getStatusBadge = (status: TicketStatus) => {
    if (status === "Resolved") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Resolved</Badge>
    if (status === "InProgress") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>
    if (status === "Closed") return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Closed</Badge>
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Open</Badge>
  }

  const getPriorityBadge = (priority: TicketPriority) => {
    if (priority === "Urgent") return <Badge className="bg-red-500 text-white border-0">Urgent</Badge>
    if (priority === "High") return <Badge className="bg-orange-100 text-orange-700 border-orange-200">High</Badge>
    if (priority === "Medium") return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Medium</Badge>
    return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Low</Badge>
  }

  const formatIncidentType = (incidentType?: SupportTicket["incidentType"]) => {
    const labels: Record<string, string> = {
      AbsentLearner: "Absent learner",
      EarlyTermination: "Early termination",
      SafetyIssue: "Safety issue",
      Misconduct: "Misconduct",
      SupervisorChanged: "Supervisor changed",
      WorksiteChanged: "Worksite changed",
      Other: "Other",
    }

    return incidentType ? labels[incidentType] || incidentType : ""
  }

  const handleCreateTicket = async () => {
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTicket),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to create support ticket")
      setNewTicket({ subject: "", category: "Technical", priority: "Medium", description: "" })
      clearDraft(NEW_TICKET_DRAFT_KEY)
      clearOfflineConflictBridge()
      setTicketOpen(false)
      if (composeOfflineReview) {
        const next = new URLSearchParams(searchParams)
        next.delete("compose")
        next.delete("offlineReview")
        setSearchParams(next, { replace: true })
      }
      if (data.offlineQueued) {
        toast.success("Support ticket saved offline. It will sync automatically.")
        return
      }
      await fetchTickets()
      toast.success("Support ticket submitted")
    } catch (error) {
      console.error("Error creating support ticket:", error)
      toast.error(error instanceof Error ? error.message : "Failed to create support ticket")
    }
  }

  const handleReply = async (ticketId: string) => {
    const message = replyDrafts[ticketId]?.trim()
    if (!message) return
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to post reply")
      setReplyDrafts((drafts) => ({ ...drafts, [ticketId]: "" }))
      clearDraft(`draft:support:reply:${ticketId}`)
      clearOfflineConflictBridge()
      if (replyOfflineReview) {
        const next = new URLSearchParams(searchParams)
        next.delete("offlineReply")
        setSearchParams(next, { replace: true })
      }
      if (data.offlineQueued) {
        toast.success("Reply saved offline. It will sync automatically.")
        return
      }
      await fetchTickets()
      toast.success("Reply added")
    } catch (error) {
      console.error("Error adding support reply:", error)
      toast.error(error instanceof Error ? error.message : "Failed to add reply")
    }
  }

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update ticket status")
      await fetchTickets()
      toast.success("Ticket status updated")
    } catch (error) {
      console.error("Error updating ticket status:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update ticket status")
    }
  }

  const handleAssignment = async (ticketId: string) => {
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/assignment`, {
        method: "PUT",
        body: JSON.stringify({ assignedTo: assignmentDrafts[ticketId] || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update assignment")
      await fetchTickets()
      toast.success("Ticket assignment updated")
    } catch (error) {
      console.error("Error updating assignment:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update assignment")
    }
  }

  const handleEscalation = async (ticketId: string) => {
    try {
      const draft = escalationDrafts[ticketId] || { escalatedTo: "", escalationLevel: "None" as const, escalationReason: "" }
      const res = await authFetch(`/api/support-tickets/${ticketId}/escalation`, {
        method: "PUT",
        body: JSON.stringify({
          escalatedTo: draft.escalatedTo || null,
          escalationLevel: draft.escalationLevel,
          escalationReason: draft.escalationReason,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update escalation")
      await fetchTickets()
      toast.success("Ticket escalation updated")
    } catch (error) {
      console.error("Error updating escalation:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update escalation")
    }
  }

  const handleMarkSeen = async (ticketId: string) => {
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/read`, {
        method: "PUT",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to mark ticket as seen")
      await fetchTickets()
    } catch (error) {
      console.error("Error marking ticket as seen:", error)
      toast.error(error instanceof Error ? error.message : "Failed to mark ticket as seen")
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={ticketOpen} onOpenChange={(next) => {
        setTicketOpen(next)
        if (!next && composeOfflineReview) {
          clearOfflineConflictBridge()
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete("compose")
          nextParams.delete("offlineReview")
          setSearchParams(nextParams, { replace: true })
        }
      }}>
        <DialogContent className="sm:max-w-[760px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="pt-6 px-6 pb-0">
            <DialogTitle className="text-gray-900">Open Support Ticket</DialogTitle>
            <DialogDescription className="text-gray-500">
              Describe the issue clearly so the right team can respond quickly.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-5">
            <Input
              placeholder="Subject"
              value={newTicket.subject}
              onChange={(e) => setNewTicket((ticket) => ({ ...ticket, subject: e.target.value }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={newTicket.category} onValueChange={(value) => setNewTicket((ticket) => ({ ...ticket, category: value as TicketCategory }))}>
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
              <Select value={newTicket.priority} onValueChange={(value) => setNewTicket((ticket) => ({ ...ticket, priority: value as TicketPriority }))}>
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
              placeholder="Explain what happened, where it happened, and what result you expected."
              value={newTicket.description}
              onChange={(e) => setNewTicket((ticket) => ({ ...ticket, description: e.target.value }))}
            />
            <Button className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={handleCreateTicket}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Submit Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isHQ ? (
        <div className="rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.22),_transparent_35%),linear-gradient(135deg,_#0f172a_0%,_#111827_55%,_#1e293b_100%)] p-6 md:p-8 text-white shadow-2xl">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-amber-200">
                <ShieldAlert className="h-3.5 w-3.5" />
                HQ Admin Center
              </div>
              <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
                <LifeBuoy className="h-7 w-7 md:h-9 md:w-9 text-amber-300" />
                Support Command Queue
              </h2>
              <p className="mt-3 text-sm md:text-base font-medium text-slate-200">
                Triage escalations, watch SLA exposure, and keep the national support queue moving. This workspace is framed for the team that receives and governs tickets, not the teams raising them.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-xl bg-amber-300 hover:bg-amber-400 text-slate-950" onClick={() => setTicketOpen(true)}>
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                Open HQ Ticket
              </Button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">Awaiting Support</p>
              <p className="mt-2 text-3xl font-black text-white">{hqQueueStats.awaitingSupport}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Tickets currently sitting with HQ or support operations.</p>
            </div>
            <div className="rounded-[1.5rem] border border-red-400/20 bg-red-400/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-200">Urgent Queue</p>
              <p className="mt-2 text-3xl font-black text-white">{hqQueueStats.urgent}</p>
              <p className="mt-1 text-xs font-medium text-red-100/80">Highest-priority tickets needing immediate triage.</p>
            </div>
            <div className="rounded-[1.5rem] border border-sky-400/20 bg-sky-400/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-200">Unassigned</p>
              <p className="mt-2 text-3xl font-black text-white">{hqQueueStats.unassigned}</p>
              <p className="mt-1 text-xs font-medium text-sky-100/80">Tickets with no named owner yet.</p>
            </div>
            <div className="rounded-[1.5rem] border border-fuchsia-400/20 bg-fuchsia-400/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-fuchsia-200">Incidents</p>
              <p className="mt-2 text-3xl font-black text-white">{hqQueueStats.incidents}</p>
              <p className="mt-1 text-xs font-medium text-fuchsia-100/80">Structured incident reports in the shared queue.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <LifeBuoy className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
              Help & Support Center
            </h2>
            <p className="text-muted-foreground mt-1 font-medium">
              Role-specific guides, common answers, and support tickets in one place.
            </p>
          </div>
          <Button className="rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={() => setTicketOpen(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-gray-100/70 p-1 rounded-2xl inline-flex h-auto">
          <TabsTrigger value="guides" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">{isHQ ? "HQ Playbook" : "Role Guides"}</TabsTrigger>
          <TabsTrigger value="faq" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">FAQ</TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">{isHQ ? "Admin Queue" : "Support Tickets"}</TabsTrigger>
        </TabsList>

        <TabsContent value="guides" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className={`${isHQ ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white" : "bg-gradient-to-br from-[#FFB800]/10 via-white to-amber-50"} border-none shadow-xl rounded-[2rem]`}>
              <CardHeader>
                <CardTitle className={`text-xl font-black ${isHQ ? "text-white" : "text-gray-900"} flex items-center gap-2`}>
                  <BookOpen className={`h-5 w-5 ${isHQ ? "text-amber-300" : "text-[#FFB800]"}`} />
                  {isHQ ? "HQ Ticket Governance Playbook" : `Guide for ${role}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {visibleGuides.map((guide) => (
                  <div key={guide.title} className={`rounded-2xl ${isHQ ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100"} p-5`}>
                    <h3 className={`font-black ${isHQ ? "text-white" : "text-gray-900"}`}>{guide.title}</h3>
                    <p className={`text-sm mt-1 ${isHQ ? "text-slate-300" : "text-gray-600"}`}>{guide.summary}</p>
                    <div className="mt-4 space-y-2">
                      {guide.steps.map((step, index) => (
                        <div key={step} className={`flex items-start gap-3 text-sm ${isHQ ? "text-slate-200" : "text-gray-700"}`}>
                          <span className={`w-6 h-6 rounded-full ${isHQ ? "bg-amber-300/15 text-amber-200" : "bg-[#FFB800]/15 text-[#B78100]"} font-black flex items-center justify-center shrink-0`}>{index + 1}</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className={`${isHQ ? "bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] border border-slate-200/70" : "bg-white"} border-none shadow-xl rounded-[2rem]`}>
              <CardHeader>
                <CardTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Headset className={`h-5 w-5 ${isHQ ? "text-slate-700" : "text-indigo-500"}`} />
                  {isHQ ? "HQ Triage Discipline" : "Support Workflow Tips"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(isHQ
                  ? [
                      "Assign ownership early so no escalated ticket sits without a named responder.",
                      "Work the queue by SLA risk and urgent incidents before general workflow questions.",
                      "Use escalation notes to document why HQ intervention was required and what the next decision point is.",
                      "Keep requester replies in the same thread so the audit trail stays intact for compliance review.",
                    ]
                  : [
                      "Search the FAQ first for known workflow answers.",
                      "Open one ticket per issue so replies stay focused.",
                      "Use High or Urgent only when work is blocked.",
                      "Reply on the existing ticket when support asks follow-up questions.",
                    ]).map((tip) => (
                  <div key={tip} className={`p-4 rounded-2xl text-sm font-medium border ${isHQ ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-gray-50 text-gray-700 border-gray-100"}`}>
                    {tip}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
                <CircleHelp className="h-5 w-5 text-indigo-500" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {FAQS.map((faq, index) => {
                const expanded = expandedFaq === index
                return (
                  <button
                    key={faq.question}
                    type="button"
                    className="w-full text-left rounded-2xl border border-gray-100 bg-gray-50/80 p-5 transition-colors hover:bg-gray-50"
                    onClick={() => setExpandedFaq(expanded ? null : index)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-black text-gray-900">{faq.question}</h3>
                      <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                    {expanded && (
                      <p className="text-sm text-gray-600 mt-3 leading-relaxed">{faq.answer}</p>
                    )}
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6 space-y-6">
          {isHQ ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="xl:col-span-2 bg-white border border-slate-200/70 shadow-xl rounded-[2rem]">
                <CardHeader>
                  <CardTitle className="text-xl font-black text-slate-950">HQ Queue Priorities</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-[1.5rem] bg-red-50 border border-red-100 p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-600">Urgent Triage</p>
                    <p className="mt-2 text-sm font-medium text-slate-700">Review urgent tickets and any active incidents before standard workflow requests.</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-amber-50 border border-amber-100 p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-700">SLA Protection</p>
                    <p className="mt-2 text-sm font-medium text-slate-700">Work breach-risk tickets first to protect first response and resolution commitments.</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-sky-50 border border-sky-100 p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-700">Escalation Control</p>
                    <p className="mt-2 text-sm font-medium text-slate-700">Confirm owner, reason, and next action before leaving any item escalated to HQ.</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[linear-gradient(180deg,_#0f172a_0%,_#111827_100%)] border-none shadow-xl rounded-[2rem] text-white">
                <CardHeader>
                  <CardTitle className="text-xl font-black text-white">Queue Focus</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm font-medium text-slate-300">Awaiting support action</span>
                    <span className="text-xl font-black text-white">{hqQueueStats.awaitingSupport}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm font-medium text-slate-300">Unassigned tickets</span>
                    <span className="text-xl font-black text-white">{hqQueueStats.unassigned}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm font-medium text-slate-300">Incidents in queue</span>
                    <span className="text-xl font-black text-white">{hqQueueStats.incidents}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28 rounded-[2rem]" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-6">
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Total Tickets</p><p className="text-3xl font-black text-gray-900">{ticketStats.total}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Open</p><p className="text-3xl font-black text-amber-600">{ticketStats.open}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">In Progress</p><p className="text-3xl font-black text-blue-600">{ticketStats.inProgress}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Resolved</p><p className="text-3xl font-black text-emerald-600">{ticketStats.resolved}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">New Activity</p><p className="text-3xl font-black text-indigo-600">{ticketStats.unread}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Owned by Me</p><p className="text-3xl font-black text-sky-600">{ticketStats.ownedByMe}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">SLA Breaches</p><p className="text-3xl font-black text-red-600">{ticketStats.breached}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Escalated</p><p className="text-3xl font-black text-fuchsia-600">{ticketStats.escalated}</p></CardContent></Card>
            </div>
          )}

          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-500">
                    Tickets stay scoped to your role. Use queue views to focus on new activity, tickets you own, or items awaiting your response.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select value={queueView || ALL_QUEUE_VIEWS} onValueChange={(value) => setQueueView(value === ALL_QUEUE_VIEWS ? "" : value)}>
                    <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                      <SelectValue placeholder="Queue view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_QUEUE_VIEWS}>All tickets</SelectItem>
                      <SelectItem value="new">New activity</SelectItem>
                      <SelectItem value="owned">Owned by me</SelectItem>
                      <SelectItem value="awaiting">Awaiting my response</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter || ALL_STATUSES} onValueChange={(value) => setStatusFilter(value === ALL_STATUSES ? "" : value)}>
                    <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="InProgress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loading ? (
              [...Array(3)].map((_, index) => <Skeleton key={index} className="h-52 rounded-[2rem]" />)
            ) : visibleTickets.length === 0 ? (
              <Card className="bg-white border-none shadow-xl rounded-[2rem]">
                <CardContent className="p-12 text-center">
                  <Ticket className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="font-medium text-gray-500">No support tickets match this queue view</p>
                </CardContent>
              </Card>
            ) : (
              visibleTickets.map((ticket) => (
                <Card
                  id={`support-ticket-${ticket._id}`}
                  key={ticket._id}
                  className={`border-none shadow-xl rounded-[2rem] overflow-hidden ${
                    ticket._id === deepLinkedTicketId
                      ? "bg-amber-50 ring-2 ring-amber-300"
                      : ticket.hasUnreadChanges
                        ? "bg-blue-50/40 ring-1 ring-blue-100"
                        : "bg-white"
                  }`}
                >
                  <CardHeader className="border-b border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg font-black text-gray-900">{ticket.subject}</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                          Opened by {ticket.requester.name} on {new Date(ticket.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {getPriorityBadge(ticket.priority)}
                        {ticket._id === deepLinkedTicketId ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Opened from notification</Badge>
                        ) : null}
                        {ticket.hasUnreadChanges ? (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">New Activity</Badge>
                        ) : null}
                        {ticket.isOwnedByCurrentUser ? (
                          <Badge className="bg-sky-100 text-sky-700 border-sky-200">Owned by you</Badge>
                        ) : null}
                        {ticket.ticketType === "Incident" ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200">Incident</Badge>
                        ) : null}
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{ticket.category}</Badge>
                        {getStatusBadge(ticket.status)}
                        {ticket.awaitingParty && ticket.awaitingParty !== "None" ? (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">Awaiting: {ticket.awaitingParty}</Badge>
                        ) : null}
                        {ticket.escalationLevel && ticket.escalationLevel !== "None" ? (
                          <Badge className="bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200">Escalated: {ticket.escalationLevel}</Badge>
                        ) : null}
                        {ticket.slaStatus?.hasBreach ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200">SLA Breach</Badge>
                        ) : null}
                        {ticket.hasUnreadChanges ? (
                          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleMarkSeen(ticket._id)}>
                            Mark seen
                          </Button>
                        ) : ticket._id === deepLinkedTicketId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => {
                              const nextParams = new URLSearchParams(searchParams)
                              nextParams.delete("ticket")
                              setSearchParams(nextParams, { replace: true })
                            }}
                          >
                            Clear focus
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-sm text-gray-700 leading-relaxed">{ticket.description}</p>
                      {ticket.ticketType === "Incident" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ticket.incidentType ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200">{formatIncidentType(ticket.incidentType)}</Badge>
                          ) : null}
                          {ticket.incidentDate ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              Incident date: {new Date(ticket.incidentDate).toLocaleDateString()}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      {(ticket.learner || ticket.placement) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ticket.learner ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => navigate(`/learners/${ticket.learner!._id}`)}
                            >
                              Learner: {ticket.learner.name}
                              <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {ticket.placement ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => navigate(`/placements?placement=${ticket.placement!._id}`)}
                            >
                              Placement: {ticket.placement.companyName}
                              <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Evidence & Attachments</p>
                          <p className="text-sm text-gray-600 mt-1">Upload supporting files for this ticket thread.</p>
                        </div>
                      </div>
                      <DocumentList documents={ticket.documents || []} onDelete={fetchTickets} />
                      <DocumentUpload
                        supportTicketId={ticket._id}
                        placementId={ticket.placement?._id}
                        learnerId={ticket.learner?._id}
                        defaultCategory={ticket.ticketType === "Incident" ? "Incident Evidence" : "Support Attachment"}
                        categories={ticket.ticketType === "Incident" ? ["Incident Evidence", "Report", "Other"] : ["Support Attachment", "Report", "Other"]}
                        onUploadSuccess={fetchTickets}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Assignment</p>
                        <p className="text-sm font-bold text-gray-900">{ticket.assignedTo ? `${ticket.assignedTo.name} (${ticket.assignedTo.role})` : "Unassigned"}</p>
                        {canManageTickets ? (
                          <div className="flex flex-col md:flex-row gap-2">
                            <Select value={assignmentDrafts[ticket._id] ?? ticket.assignedTo?._id ?? "__unassigned"} onValueChange={(value) => setAssignmentDrafts((current) => ({ ...current, [ticket._id]: value === "__unassigned" ? "" : value }))}>
                              <SelectTrigger className="rounded-xl bg-white border-gray-200">
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned">Unassigned</SelectItem>
                                {assignees.map((assignee) => (
                                  <SelectItem key={assignee._id} value={assignee._id}>{assignee.name} ({assignee.role})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" className="rounded-xl" onClick={() => handleAssignment(ticket._id)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Assign
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">SLA Timers</p>
                        <p className="text-sm text-gray-700">First response due: {ticket.firstResponseDueAt ? new Date(ticket.firstResponseDueAt).toLocaleString() : "N/A"}</p>
                        <p className="text-sm text-gray-700">Resolution due: {ticket.resolutionDueAt ? new Date(ticket.resolutionDueAt).toLocaleString() : "N/A"}</p>
                        {ticket.slaStatus?.firstResponseBreached ? <p className="text-sm font-bold text-red-600">First response SLA breached</p> : null}
                        {ticket.slaStatus?.resolutionBreached ? <p className="text-sm font-bold text-red-600">Resolution SLA breached</p> : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/60 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-fuchsia-600" />
                        <h4 className="font-black text-gray-900">Escalation</h4>
                      </div>
                      <p className="text-sm text-gray-700">
                        Current owner: {ticket.escalatedTo ? `${ticket.escalatedTo.name} (${ticket.escalatedTo.role})` : "Not escalated"}
                      </p>
                      {ticket.escalationReason ? <p className="text-sm text-gray-600">Reason: {ticket.escalationReason}</p> : null}
                      {canManageTickets ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Select value={escalationDrafts[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "__none"} onValueChange={(value) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: value === "__none" ? "" : value, escalationLevel: current[ticket._id]?.escalationLevel ?? ticket.escalationLevel ?? "None", escalationReason: current[ticket._id]?.escalationReason ?? ticket.escalationReason ?? "" } }))}>
                              <SelectTrigger className="rounded-xl bg-white border-fuchsia-200">
                                <SelectValue placeholder="Escalation owner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">No escalation owner</SelectItem>
                                {assignees.map((assignee) => (
                                  <SelectItem key={assignee._id} value={assignee._id}>{assignee.name} ({assignee.role})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={escalationDrafts[ticket._id]?.escalationLevel ?? ticket.escalationLevel ?? "None"} onValueChange={(value) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: current[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "", escalationLevel: value as "None" | "Regional" | "HQ", escalationReason: current[ticket._id]?.escalationReason ?? ticket.escalationReason ?? "" } }))}>
                              <SelectTrigger className="rounded-xl bg-white border-fuchsia-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="None">None</SelectItem>
                                <SelectItem value="Regional">Regional</SelectItem>
                                <SelectItem value="HQ">HQ</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea
                            placeholder="Why is this ticket being escalated?"
                            value={escalationDrafts[ticket._id]?.escalationReason ?? ticket.escalationReason ?? ""}
                            onChange={(e) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: current[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "", escalationLevel: current[ticket._id]?.escalationLevel ?? ticket.escalationLevel ?? "None", escalationReason: e.target.value } }))}
                            className="bg-white"
                          />
                          <Button variant="outline" className="rounded-xl border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50" onClick={() => handleEscalation(ticket._id)}>
                            Update Escalation
                          </Button>
                        </>
                      ) : null}
                    </div>

                    {(canManageTickets || ticket.requester._id === user?._id) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {(["Open", "InProgress", "Resolved", "Closed"] as TicketStatus[]).map((status) => (
                          <Button
                            key={status}
                            variant={ticket.status === status ? "default" : "outline"}
                            className={`rounded-xl ${ticket.status === status ? "bg-[#FFB800] text-gray-900 hover:bg-[#e5a600]" : ""}`}
                            onClick={() => handleStatusChange(ticket._id, status)}
                          >
                            {status === "InProgress" ? "In Progress" : status}
                          </Button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                      <h4 className="font-black text-gray-900">Replies</h4>
                      {ticket.replies.length === 0 ? (
                        <p className="text-sm text-gray-500">No replies yet.</p>
                      ) : (
                        ticket.replies.map((reply) => (
                          <div key={reply._id} className="rounded-2xl border border-gray-100 p-4 bg-white">
                            <div className="flex items-center justify-between gap-4">
                              <div className="font-bold text-gray-900">{reply.createdByName}</div>
                              <div className="text-xs text-gray-400 font-medium">
                                {reply.createdByRole} · {new Date(reply.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{reply.message}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-3">
                            <Textarea
                                placeholder="Add a reply or follow-up note..."
                                value={replyDrafts[ticket._id] || ""}
                                onChange={(e) => setReplyDrafts((drafts) => ({ ...drafts, [ticket._id]: e.target.value }))}
                                className="bg-white"
                              />
                      <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => handleReply(ticket._id)}>
                        <SendHorizonal className="h-4 w-4 mr-2" />
                        Post Reply
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
