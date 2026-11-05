import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/lib/toast"
import { useAuth } from "@/context/AuthContext"
import { AlertTriangle, ArrowUpRight, BookOpen, ChevronDown, CircleHelp, Headset, LifeBuoy, MessageSquarePlus, SendHorizonal, Ticket, UserPlus } from "lucide-react"
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
import "./support-center.css"
import { GuideCatalog } from "@/components/HelpWizard"

type RoleKey = "SuperAdmin" | "HQManager" | "HQStaff" | "RegionalAdmin" | "Admin" | "Manager" | "Staff" | "IndustryPartner" | "Guardian"
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
  firstRespondedAt?: string
  archivedAt?: string
  activity?: Array<{ _id: string; actorName: string; detail: string; createdAt: string }>
  updatedAt: string
  requesterRole: string
  institution?: string
  region?: string
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
  resolutionSummary?: string
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
  region?: string
}

interface SupportTicketStats {
  total: number
  open: number
  inProgress: number
  resolved: number
  breached: number
  escalated: number
  unread: number
  ownedByMe: number
  awaitingMe?: number
}

interface SupportQueueStats {
  awaitingSupport: number
  urgent: number
  unassigned: number
  incidents: number
}

const ALL_STATUSES = "__all_statuses"
const ALL_QUEUE_VIEWS = "__all_queue_views"
const ALL_GUIDE_CATEGORIES = "__all_guide_categories"
const supportDraftKey = (userId: string, suffix: string) => `draft:support:${userId}:${suffix}`

const ROLE_GUIDES: Record<RoleKey, Array<{ title: string; summary: string; steps: string[] }>> = {
  SuperAdmin: [
    { title: "Oversee the full WEL network", summary: "Use overview dashboards, support tickets, and academic calendar controls to steer the platform.", steps: ["Review system overview weekly.", "Resolve escalated support tickets.", "Update academic calendar milestones before each term."] },
    { title: "Manage platform governance", summary: "Set the operating rules for regions, institutions, and partner workflows.", steps: ["Verify user roles before account creation.", "Monitor approval bottlenecks across regions.", "Close resolved support tickets to keep the queue clean."] },
  ],
  HQManager: [
    { title: "Review national support activity", summary: "Read support tickets and route issues through authorized administrators.", steps: ["Review ticket details and attachments.", "Contact the responsible administrator for action."] },
  ],
  HQStaff: [
    { title: "Review support information", summary: "Use the queue for read-only support oversight.", steps: ["Open ticket details.", "Share follow-up needs with an administrator."] },
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
  { question: "Who can see my support tickets?", answer: "Institution users see tickets for their institution, regional admins see tickets in their region, HQ access follows the user’s national, regional, or institution scope, and industry partners see their own company-linked tickets." },
  { question: "When should I use a support ticket instead of a notification?", answer: "Use notifications for awareness. Use support tickets when you need action, investigation, or a back-and-forth response thread." },
  { question: "What should I include in a good ticket?", answer: "Describe the page, the action you tried, the learner or partner involved, the exact error if any, and what outcome you expected." },
  { question: "Can I close a ticket myself?", answer: "Once support marks a ticket Resolved, the requester can confirm closure. Reopen a resolved or closed ticket if the issue persists." },
  { question: "How do I get faster help?", answer: "Choose the right category, set the correct priority, and avoid duplicate tickets for the same issue." },
]

export default function SupportCenter() {
  const { authFetch, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const ticketRequestSequence = useRef(0)
  const [assignees, setAssignees] = useState<SupportAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketPage, setTicketPage] = useState(() => Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1))
  const [ticketPageSize] = useState(10)
  const [ticketTotal, setTicketTotal] = useState(0)
  const [ticketTotalPages, setTicketTotalPages] = useState(1)
  const [ticketError, setTicketError] = useState(false)
  const [focusedTicket, setFocusedTicket] = useState<SupportTicket | null>(null)
  const [ticketStats, setTicketStats] = useState<SupportTicketStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    breached: 0,
    escalated: 0,
    unread: 0,
    ownedByMe: 0,
  })
  const [hqQueueStats, setHqQueueStats] = useState<SupportQueueStats>({
    awaitingSupport: 0,
    urgent: 0,
    unassigned: 0,
    incidents: 0,
  })
  const [ticketOpen, setTicketOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({})
  const [escalationDrafts, setEscalationDrafts] = useState<Record<string, { escalatedTo: string; escalationLevel: "None" | "Regional" | "HQ"; escalationReason: string }>>({})
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "")
  const [queueView, setQueueView] = useState(searchParams.get("queueView") || "")
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search") || "")
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get("priority") || "")
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "")
  const [slaFilter, setSlaFilter] = useState(searchParams.get("sla") || "")
  const [institutionFilter, setInstitutionFilter] = useState(searchParams.get("institution") || "")
  const [regionFilter, setRegionFilter] = useState(searchParams.get("region") || "")
  const [typeFilter, setTypeFilter] = useState(searchParams.get("ticketType") || "")
  const [sort, setSort] = useState(searchParams.get("sort") || "recent")
  const [institutions, setInstitutions] = useState<Array<{ name: string; region: string }>>([])
  const [faqSearch, setFaqSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)
  const pendingActions = useRef(new Set<string>())
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [learnerSearch, setLearnerSearch] = useState("")
  const [contextOptions, setContextOptions] = useState<Array<{ _id: string; name: string; trackingId: string; institution: string }>>([])
  const [placementOptions, setPlacementOptions] = useState<Array<{ _id: string; companyName: string; status: string }>>([])
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState("")
  const replyAttempts = useRef<Record<string, { message: string; requestKey: string }>>({})
  const [savingTicket, setSavingTicket] = useState(false)
  const [draftLoadedOwner, setDraftLoadedOwner] = useState("")
  const [resolutionTicketId, setResolutionTicketId] = useState<string | null>(null)
  const [resolutionSummary, setResolutionSummary] = useState("")
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
  const [newTicket, setNewTicket] = useState<{ subject: string; category: TicketCategory; priority: TicketPriority; description: string; requestKey: string; learnerId?: string; learnerLabel?: string; placementId?: string }>({
    subject: "",
    category: "Technical" as TicketCategory,
    priority: "Medium" as TicketPriority,
    description: "",
    requestKey: crypto.randomUUID(),
  })
  const deepLinkedTicketId = searchParams.get("ticket")?.trim() || ""
  const composeOfflineReview = searchParams.get("compose") === "1" || searchParams.get("offlineReview") === "1"
  const replyOfflineReview = searchParams.get("offlineReply") === "1"
  const [activeTab, setActiveTab] = useState("tickets")
  const draftOwner = user?._id || ""
  const newTicketDraftKey = draftOwner ? supportDraftKey(draftOwner, "new-ticket") : ""
  const [guideSearch, setGuideSearch] = useState("")
  const [guideCategory, setGuideCategory] = useState(ALL_GUIDE_CATEGORIES)

  const role = (user?.role || "Staff") as RoleKey
  const canManageTickets = role === "SuperAdmin" || role === "RegionalAdmin" || role === "Admin"
  const canWriteSupport = role !== "HQManager" && role !== "HQStaff"
  const isHQ = ["SuperAdmin", "HQManager", "HQStaff"].includes(role)
  const canChooseContext = ["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff"].includes(role)
  const canFilterInstitutions = isHQ || role === "RegionalAdmin"
  const beginAction = (key: string) => {
    if (pendingActions.current.has(key)) return false
    pendingActions.current.add(key)
    setPending(current => ({ ...current, [key]: true }))
    return true
  }
  const endAction = (key: string) => {
    pendingActions.current.delete(key)
    setPending(current => ({ ...current, [key]: false }))
  }
  const filterValues = { status: statusFilter, queueView, search: debouncedSearch, priority: priorityFilter, category: categoryFilter, sla: slaFilter, institution: institutionFilter, region: regionFilter, ticketType: typeFilter, sort }
  const filterSignature = JSON.stringify(filterValues)
  const previousFilters = useRef(filterSignature)
  useEffect(() => {
    const values = JSON.parse(filterSignature) as Record<string, string>
    const next = new URLSearchParams(searchParams)
    Object.entries(values).forEach(([key, value]) => { if (value && !(key === "sort" && value === "recent")) next.set(key, value); else next.delete(key) })
    const changed = previousFilters.current !== filterSignature
    previousFilters.current = filterSignature
    if (changed) setTicketPage(1)
    const page = changed ? 1 : ticketPage
    if (page > 1) next.set("page", String(page)); else next.delete("page")
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [filterSignature, ticketPage, searchParams, setSearchParams])

  useEffect(() => {
    if (!canFilterInstitutions) return
    let cancelled = false
    authFetch("/api/institutions").then(async res => {
      if (!res.ok) throw new Error("Unable to load institution filters")
      const data = await res.json()
      if (!cancelled) setInstitutions(Array.isArray(data) ? data : [])
    }).catch(() => { if (!cancelled) toast.error("Institution filters could not be loaded. Refresh to retry.") })
    return () => { cancelled = true }
  }, [authFetch, canFilterInstitutions])

  useEffect(() => {
    if (!ticketOpen || !canChooseContext) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setContextLoading(true)
      setContextError("")
      try {
        const params = new URLSearchParams({ search: learnerSearch })
        if (newTicket.learnerId) params.set("learnerId", newTicket.learnerId)
        const res = await authFetch(`/api/support-context?${params}`, { signal: controller.signal })
        if (!res.ok) throw new Error("Unable to load learner context. Try searching again.")
        const data = await res.json()
        if (!controller.signal.aborted) { setContextOptions(data.learners); setPlacementOptions(data.placements) }
      } catch (error) {
        if (!controller.signal.aborted) setContextError(error instanceof Error ? error.message : "Unable to load context")
      } finally { if (!controller.signal.aborted) setContextLoading(false) }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [authFetch, canChooseContext, ticketOpen, learnerSearch, newTicket.learnerId])

  const clearFilters = () => {
    setSearch(""); setQueueView(""); setStatusFilter(""); setPriorityFilter(""); setCategoryFilter(""); setSlaFilter(""); setInstitutionFilter(""); setRegionFilter(""); setTypeFilter(""); setTicketPage(1)
  }
  const activeFilters = Object.entries({ status: statusFilter, queue: queueView, search, priority: priorityFilter, category: categoryFilter, SLA: slaFilter, institution: institutionFilter, region: regionFilter, type: typeFilter }).filter(([, value]) => value)
  const nextAction = (ticket: SupportTicket) => ["Resolved", "Closed"].includes(ticket.status)
    ? ticket.status === "Resolved" ? ticket.requester._id === user?._id && canWriteSupport ? "Review the resolution and confirm closure, or reopen." : "Resolved · awaiting requester confirmation" : "Closed"
    : ticket.awaitingParty === "Requester" ? ticket.requester._id === user?._id ? "Your reply is needed" : "Awaiting the requester’s reply"
    : `Awaiting support · ${ticket.escalatedTo?.name || ticket.assignedTo?.name || "Waiting for assignment"}`
  const deadlineLabel = (ticket: SupportTicket) => {
    if (["Resolved", "Closed"].includes(ticket.status)) return ""
    const due = !ticket.firstRespondedAt ? ticket.firstResponseDueAt : ticket.resolutionDueAt
    if (!due) return "Deadline not recorded"
    const hours = Math.floor(Math.abs(new Date(due).getTime() - Date.now()) / 3600000)
    return `${!ticket.firstRespondedAt ? "Response" : "Resolution"} ${new Date(due).getTime() < Date.now() ? "overdue by" : "due in"} ${hours < 1 ? "less than 1h" : `${hours}h`}`
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    clearDraft("draft:support:new-ticket")
    if (!newTicketDraftKey) return
    const draft = loadDraft<typeof newTicket>(newTicketDraftKey)
    setReplyDrafts({})
    replyAttempts.current = {}
    setNewTicket(draft ? {
        subject: draft.subject || "",
        category: draft.category || "Technical",
        priority: draft.priority || "Medium",
        description: draft.description || "",
        requestKey: draft.requestKey || crypto.randomUUID(),
        learnerId: draft.learnerId, learnerLabel: draft.learnerLabel, placementId: draft.placementId,
      } : { subject: "", category: "Technical", priority: "Medium", description: "", requestKey: crypto.randomUUID() })
    setDraftLoadedOwner(draftOwner)
  }, [draftOwner, newTicketDraftKey])

  useEffect(() => {
    if (!newTicketDraftKey || draftLoadedOwner !== draftOwner) return
    if (newTicket.subject || newTicket.description) {
      saveDraft(newTicketDraftKey, newTicket)
    } else {
      clearDraft(newTicketDraftKey)
    }
  }, [draftLoadedOwner, draftOwner, newTicket, newTicketDraftKey])

  useEffect(() => {
    if (draftLoadedOwner !== draftOwner) return
    Object.entries(replyDrafts).forEach(([ticketId, draft]) => {
      if (!draftOwner) return
      const key = supportDraftKey(draftOwner, `reply:${ticketId}`)
      if (draft?.trim()) saveDraft(key, draft)
      else clearDraft(key)
    })
  }, [draftLoadedOwner, draftOwner, replyDrafts])

  const fetchTickets = useCallback(async () => {
    const requestSequence = ++ticketRequestSequence.current
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)
      if (priorityFilter) params.set("priority", priorityFilter)
      if (categoryFilter) params.set("category", categoryFilter)
      if (slaFilter) params.set("sla", slaFilter)
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      if (institutionFilter) params.set("institution", institutionFilter)
      if (regionFilter) params.set("region", regionFilter)
      if (typeFilter) params.set("ticketType", typeFilter)
      params.set("sort", sort)
      if (queueView) params.set("queueView", queueView)
      params.set("page", String(ticketPage))
      params.set("pageSize", String(ticketPageSize))
      if (deepLinkedTicketId) params.set("focusedTicketId", deepLinkedTicketId)
      const res = await authFetch(`/api/support-tickets?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch support tickets")
      const data = await res.json()
      if (requestSequence !== ticketRequestSequence.current) return
      setTickets(Array.isArray(data.items) ? data.items : [])
      setTicketTotal(typeof data.total === "number" ? data.total : 0)
      setTicketTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1)
      setTicketPage(typeof data.page === "number" ? data.page : 1)
      setFocusedTicket(data.focusedTicket ?? null)
      setTicketError(false)
      setTicketStats(data.stats ?? {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        breached: 0,
        escalated: 0,
        unread: 0,
        ownedByMe: 0,
      })
      setHqQueueStats(data.hqQueueStats ?? {
        awaitingSupport: 0,
        urgent: 0,
        unassigned: 0,
        incidents: 0,
      })
    } catch (error) {
      if (requestSequence !== ticketRequestSequence.current) return
      console.error("Error fetching support tickets:", error)
      setTicketError(true)
      toast.error("Failed to load support tickets")
    } finally {
      if (requestSequence === ticketRequestSequence.current) setLoading(false)
    }
  }, [authFetch, categoryFilter, debouncedSearch, deepLinkedTicketId, priorityFilter, queueView, slaFilter, statusFilter, ticketPage, ticketPageSize, institutionFilter, regionFilter, typeFilter, sort])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    window.addEventListener("focus", fetchTickets)
    return () => window.removeEventListener("focus", fetchTickets)
  }, [fetchTickets])

  useEffect(() => {
    if (deepLinkedTicketId) {
      setActiveTab("tickets")
      setExpandedTicketId(deepLinkedTicketId)
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
        requestKey: typeof bridge.payload.requestKey === "string" ? bridge.payload.requestKey : crypto.randomUUID(),
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
        const savedDraft = draftOwner ? loadDraft<string>(supportDraftKey(draftOwner, `reply:${ticket._id}`)) : null
        if (savedDraft) {
          next[ticket._id] = savedDraft
        }
      }
      return next
    })
  }, [draftOwner, tickets])

  const visibleGuides = ROLE_GUIDES[role] || ROLE_GUIDES.Staff
  const faqs = FAQS.map(faq => faq.question === "Can I close a ticket myself?" && !canWriteSupport
    ? { ...faq, answer: "Your HQ role provides read-only oversight. Ask the responsible administrator to resolve or reopen a ticket. The requester can confirm closure after resolution." }
    : faq)

  const visibleTickets = useMemo(() => {
    if (!focusedTicket) return tickets
    if (tickets.some((ticket) => ticket._id === focusedTicket._id)) return tickets
    return [focusedTicket, ...tickets]
  }, [focusedTicket, tickets])

  const assigneesForTicket = (ticket: SupportTicket) => assignees.filter((assignee) => (
    assignee.role === "SuperAdmin"
    || (assignee.role === "RegionalAdmin" && Boolean(ticket.region) && assignee.region === ticket.region)
    || (Boolean(ticket.institution) && ticket.institution === assignee.institution)
  ))

  useEffect(() => {
    if (!deepLinkedTicketId || loading || activeTab !== "tickets") return

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(`support-ticket-${deepLinkedTicketId}`)
      if (element) {
        element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, deepLinkedTicketId, loading, visibleTickets.length])

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
    if (savingTicket) return
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      toast.error("Enter a subject and description")
      return
    }
    if (!beginAction("create")) return
    setSavingTicket(true)
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTicket, learnerLabel: undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to create support ticket")
      setNewTicket({ subject: "", category: "Technical", priority: "Medium", description: "", requestKey: crypto.randomUUID() })
      if (newTicketDraftKey) clearDraft(newTicketDraftKey)
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
      setActiveTab("tickets")
      setExpandedTicketId(data._id || null)
      clearFilters()
      if (data._id) { const next = new URLSearchParams(); next.set("ticket", data._id); setSearchParams(next, { replace: true }) }
      toast.success(`Ticket #${String(data._id).slice(-8).toUpperCase()} submitted. You can now attach screenshots below.`)
    } catch (error) {
      console.error("Error creating support ticket:", error)
      toast.error(error instanceof Error ? error.message : "Failed to create support ticket")
    } finally {
      setSavingTicket(false)
      endAction("create")
    }
  }

  const handleReply = async (ticketId: string) => {
    const message = replyDrafts[ticketId]?.trim()
    if (!message || !beginAction(`reply:${ticketId}`)) return
    const attemptKey = draftOwner ? supportDraftKey(draftOwner, `reply-attempt:${ticketId}`) : ""
    const savedAttempt = replyAttempts.current[ticketId] || (attemptKey ? loadDraft<{ message: string; requestKey: string }>(attemptKey) : null)
    const attempt = savedAttempt?.message === message ? savedAttempt : { message, requestKey: crypto.randomUUID() }
    replyAttempts.current[ticketId] = attempt
    try {
      if (attemptKey) saveDraft(attemptKey, attempt)
      const res = await authFetch(`/api/support-tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to post reply")
      delete replyAttempts.current[ticketId]
      if (attemptKey) clearDraft(attemptKey)
      setReplyDrafts((drafts) => ({ ...drafts, [ticketId]: drafts[ticketId]?.trim() === message ? "" : drafts[ticketId] }))
      if (draftOwner) clearDraft(supportDraftKey(draftOwner, `reply:${ticketId}`))
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
    } finally {
      endAction(`reply:${ticketId}`)
    }
  }

  const handleStatusChange = async (ticketId: string, status: TicketStatus, summary = "") => {
    if (status === "Resolved" && !summary.trim()) {
      setResolutionTicketId(ticketId)
      return
    }
    if (!beginAction(`status:${ticketId}`)) return
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(summary ? { resolutionSummary: summary.trim() } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update ticket status")
      await fetchTickets()
      setResolutionTicketId(null)
      setResolutionSummary("")
      toast.success("Ticket status updated")
    } catch (error) {
      console.error("Error updating ticket status:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update ticket status")
    } finally {
      endAction(`status:${ticketId}`)
    }
  }

  const handleAssignment = async (ticketId: string) => {
    if (!beginAction(`assignment:${ticketId}`)) return
    try {
      const res = await authFetch(`/api/support-tickets/${ticketId}/assignment`, {
        method: "PUT",
        body: JSON.stringify({ assignedTo: assignmentDrafts[ticketId] ?? tickets.find((ticket) => ticket._id === ticketId)?.assignedTo?._id ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to update assignment")
      await fetchTickets()
      toast.success("Ticket assignment updated")
    } catch (error) {
      console.error("Error updating assignment:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update assignment")
    } finally {
      endAction(`assignment:${ticketId}`)
    }
  }

  const handleEscalation = async (ticketId: string) => {
    if (!beginAction(`escalation:${ticketId}`)) return
    try {
      const ticket = tickets.find((entry) => entry._id === ticketId)
      const draft = escalationDrafts[ticketId] || { escalatedTo: ticket?.escalatedTo?._id || "", escalationLevel: ticket?.escalationLevel || "None" as const, escalationReason: ticket?.escalationReason || "" }
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
    } finally {
      endAction(`escalation:${ticketId}`)
    }
  }

  const handleMarkSeen = async (ticketId: string) => {
    if (!beginAction(`read:${ticketId}`)) return
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
    } finally {
      endAction(`read:${ticketId}`)
    }
  }

  return (
    <div className="support-center flex-1 space-y-5 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <Dialog open={Boolean(resolutionTicketId)} onOpenChange={(open) => { if (!open) { setResolutionTicketId(null); setResolutionSummary("") } }}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Resolve ticket</DialogTitle><DialogDescription>Summarize what was done so the requester can review the outcome.</DialogDescription></DialogHeader>
          <label htmlFor="support-resolution" className="text-sm font-medium">Resolution summary</label>
          <Textarea id="support-resolution" value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} />
          <Button disabled={!resolutionSummary.trim() || Boolean(resolutionTicketId && pending[`status:${resolutionTicketId}`])} onClick={() => { if (resolutionTicketId) void handleStatusChange(resolutionTicketId, "Resolved", resolutionSummary) }}>{resolutionTicketId && pending[`status:${resolutionTicketId}`] ? "Resolving…" : "Resolve ticket"}</Button>
        </DialogContent>
      </Dialog>
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
            <label htmlFor="support-subject" className="block text-sm font-medium">Subject</label>
            <Input
              id="support-subject"
              maxLength={180}
              placeholder="For example: placement approval is blocked"
              value={newTicket.subject}
              onChange={(e) => setNewTicket((ticket) => ({ ...ticket, subject: e.target.value }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label htmlFor="support-category" className="mb-2 block text-sm font-medium">Category</label>
              <Select value={newTicket.category} onValueChange={(value) => setNewTicket((ticket) => ({ ...ticket, category: value as TicketCategory }))}>
                <SelectTrigger id="support-category" aria-label="Ticket category" className="rounded-xl bg-gray-50 border-gray-200">
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
              </div>
              <div><label htmlFor="support-priority" className="mb-2 block text-sm font-medium">Priority</label>
              <Select value={newTicket.priority} onValueChange={(value) => setNewTicket((ticket) => ({ ...ticket, priority: value as TicketPriority }))}>
                <SelectTrigger id="support-priority" aria-label="Ticket priority" className="rounded-xl bg-gray-50 border-gray-200">
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
            </div>
            <p className="text-sm text-slate-500">Low: general question · Medium: normal assistance · High: work blocked · Urgent: critical disruption or safety issue. Targets use elapsed calendar hours.</p>
            {canChooseContext ? <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold">Learner and placement (optional)</legend>
              <label htmlFor="support-learner-search" className="block text-sm">Find learner by name or tracking ID</label>
              <Input id="support-learner-search" value={learnerSearch} onChange={event => setLearnerSearch(event.target.value)} placeholder="Search authorized learners" />
              <label htmlFor="support-learner" className="block text-sm">Related learner</label>
              <select id="support-learner" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={newTicket.learnerId || ""} onChange={event => { const option = contextOptions.find(item => item._id === event.target.value); setPlacementOptions([]); setNewTicket(current => ({ ...current, learnerId: event.target.value, learnerLabel: option ? `${option.name} · ${option.trackingId}` : "", placementId: "" })) }}>
                <option value="">No learner linked</option>
                {newTicket.learnerId && !contextOptions.some(item => item._id === newTicket.learnerId) ? <option value={newTicket.learnerId}>{newTicket.learnerLabel || "Previously selected learner"}</option> : null}
                {contextOptions.map(option => <option key={option._id} value={option._id}>{option.name} · {option.trackingId} · {option.institution}</option>)}
              </select>
              {newTicket.learnerId ? <><label htmlFor="support-placement" className="block text-sm">Related placement</label><select id="support-placement" disabled={contextLoading} className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={newTicket.placementId || ""} onChange={event => setNewTicket(current => ({ ...current, placementId: event.target.value }))}>
                <option value="">No placement linked</option>
                {placementOptions.map(option => <option key={option._id} value={option._id}>{option.companyName} · {option.status}</option>)}
              </select></> : null}
              <p role="status" className="text-xs text-slate-500">{contextLoading ? "Loading learner context…" : contextError || "Showing up to 25 matches. Refine the search to find another learner."}</p>
            </fieldset> : null}
            <label htmlFor="support-description" className="block text-sm font-medium">Description</label>
            <Textarea
              id="support-description"
              maxLength={10000}
              placeholder="Explain what happened, where it happened, and what result you expected."
              value={newTicket.description}
              onChange={(e) => setNewTicket((ticket) => ({ ...ticket, description: e.target.value }))}
            />
            <p className="text-sm text-slate-500">After submission, attach screenshots or documents in the ticket’s Evidence & Attachments section. Attachments require a connection.</p>
            <Button disabled={savingTicket || !newTicket.subject.trim() || !newTicket.description.trim()} className="w-full rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900" onClick={handleCreateTicket}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              {savingTicket ? "Submitting…" : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900"><LifeBuoy className="h-6 w-6 text-amber-600" />{isHQ ? "Help & Support · HQ" : "Help & Support"}</h2>
        <p className="mt-1 text-sm text-slate-500">{isHQ ? "Review institution requests, ownership, and response deadlines." : "Get help, follow your institution’s requests, and find workflow guides."}</p></div>
        {canWriteSupport ? <Button data-help-id="support-new-ticket" className="rounded-xl bg-[#FFB800] text-gray-900 hover:bg-[#e5a600]" onClick={() => setTicketOpen(true)}><MessageSquarePlus className="h-4 w-4" />New ticket</Button> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Read-only oversight · contact the ticket owner for action</span>}
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-gray-100/70 dark:bg-slate-800 p-1 rounded-2xl inline-flex h-auto">
          <TabsTrigger data-help-id="support-guides-tab" value="guides" className="rounded-xl px-5 py-2.5 font-bold">{isHQ ? "HQ Playbook" : "Role Guides"}</TabsTrigger>
          <TabsTrigger value="faq" className="rounded-xl px-5 py-2.5 font-bold">FAQ</TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-xl px-5 py-2.5 font-bold">{isHQ ? "Admin Queue" : "Support Tickets"}</TabsTrigger>
        </TabsList>

        <TabsContent value="guides" className="mt-6">
          <div className="space-y-6">
            <Card className="rounded-[2rem] border border-amber-100 bg-amber-50/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <CircleHelp className="h-5 w-5 text-amber-600" />
                  Walkthrough Library
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-4">
                  <Input
                    aria-label="Search walkthroughs" placeholder="Search walkthroughs by page or workflow..."
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    className="rounded-xl border-amber-200 bg-white"
                  />
                  <Select value={guideCategory} onValueChange={setGuideCategory}>
                    <SelectTrigger aria-label="Walkthrough category" className="rounded-xl border-amber-200 bg-white">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_GUIDE_CATEGORIES}>All categories</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Learners">Learners</SelectItem>
                      <SelectItem value="Reporting">Reporting</SelectItem>
                      <SelectItem value="Governance">Governance</SelectItem>
                      <SelectItem value="Partners">Partners</SelectItem>
                      <SelectItem value="Personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <GuideCatalog role={role}>
                  {(guideCatalog) => {
                    const query = guideSearch.trim().toLowerCase()
                    const visibleGuideCatalog = guideCatalog.filter((guide) => {
                      const matchesCategory = guideCategory === ALL_GUIDE_CATEGORIES || guide.category === guideCategory
                      const matchesQuery =
                        !query ||
                        guide.label.toLowerCase().includes(query) ||
                        guide.catalogSummary.toLowerCase().includes(query) ||
                        guide.category.toLowerCase().includes(query)
                      return matchesCategory && matchesQuery
                    })

                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {visibleGuideCatalog.map((guide) => (
                            <div key={guide.key} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-black text-slate-900">{guide.label}</p>
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">{guide.category}</Badge>
                              </div>
                              <p className="mt-2 min-h-[60px] text-sm text-slate-600">{guide.catalogSummary}</p>
                              <Button
                                variant="outline"
                                className="mt-4 w-full rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
                                onClick={() => navigate(`${guide.launchPath}?help=1&guide=${guide.key}&restart=1`)}
                              >
                                <ArrowUpRight className="mr-2 h-4 w-4" />
                                Open Walkthrough
                              </Button>
                            </div>
                          ))}
                        </div>
                        {visibleGuideCatalog.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-amber-200 bg-white p-8 text-center text-sm text-slate-500">
                            No walkthroughs match that filter.
                          </div>
                        ) : null}
                      </>
                    )
                  }}
                </GuideCatalog>
              </CardContent>
            </Card>

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
              <Input aria-label="Search frequently asked questions" placeholder="Search questions and answers" value={faqSearch} onChange={event => setFaqSearch(event.target.value)} />
              {!faqs.some(faq => `${faq.question} ${faq.answer}`.toLowerCase().includes(faqSearch.toLowerCase())) ? <p className="text-sm text-slate-500">No answers match. Try another term or open a support ticket.</p> : null}
              {faqs.map((faq, index) => {
                if (!`${faq.question} ${faq.answer}`.toLowerCase().includes(faqSearch.toLowerCase())) return null
                const expanded = expandedFaq === index
                return (
                  <button
                    key={faq.question}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`support-faq-${index}`}
                    className="w-full text-left rounded-2xl border border-gray-100 bg-gray-50/80 p-5 transition-colors hover:bg-gray-50"
                    onClick={() => setExpandedFaq(expanded ? null : index)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-black text-gray-900">{faq.question}</h3>
                      <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                    <p id={`support-faq-${index}`} hidden={!expanded} className="text-sm text-gray-600 mt-3 leading-relaxed">{faq.answer}</p>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Queue summary">
            {[
              { label: canWriteSupport ? "Awaiting my response" : "Awaiting support", count: canWriteSupport ? ticketStats.awaitingMe || 0 : hqQueueStats.awaitingSupport, view: canWriteSupport ? "awaiting" : "support" },
              { label: "Unassigned active", count: hqQueueStats.unassigned, view: "unassigned" },
              { label: "New activity", count: ticketStats.unread, view: "new" },
              { label: "Owned by me", count: ticketStats.ownedByMe, view: "owned" },
            ].map(item => <button key={item.label} type="button" onClick={() => setQueueView(queueView === item.view ? "" : item.view)} aria-pressed={queueView === item.view} className={`rounded-xl border p-3 text-left ${queueView === item.view ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}><span className="block text-xs text-slate-500">{item.label}</span><strong className="text-xl tabular-nums text-slate-900">{loading ? "…" : item.count}</strong></button>)}
          </div>


          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Input aria-label="Search tickets" placeholder="Search subject, institution or full ticket ID" value={search} onChange={(event) => setSearch(event.target.value)} />
                  <Button variant="outline" disabled={loading} onClick={() => void fetchTickets()}>{loading ? "Refreshing…" : "Refresh"}</Button>
                </div>
                <Button variant="ghost" size="sm" aria-expanded={filtersOpen} aria-controls="support-advanced-filters" onClick={() => setFiltersOpen(current => !current)}>{filtersOpen ? "Hide filters" : "Filters and sorting"}{activeFilters.length ? ` (${activeFilters.length})` : ""}<ChevronDown className={`h-4 w-4 ${filtersOpen ? "rotate-180" : ""}`} /></Button>
                <div id="support-advanced-filters" hidden={!filtersOpen} className="space-y-3">
                {canFilterInstitutions ? <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="support-region-filter" className="mb-1 block text-xs font-medium">Region</label><select id="support-region-filter" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={regionFilter} onChange={event => { setRegionFilter(event.target.value); setInstitutionFilter("") }}><option value="">All authorized regions</option>{[...new Set(institutions.map(item => item.region))].filter(Boolean).sort().map(region => <option key={region}>{region}</option>)}</select></div>
                  <div><label htmlFor="support-institution-filter" className="mb-1 block text-xs font-medium">Institution</label><select id="support-institution-filter" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={institutionFilter} onChange={event => setInstitutionFilter(event.target.value)}><option value="">All authorized institutions</option>{institutions.filter(item => !regionFilter || item.region === regionFilter).map(item => <option key={item.name}>{item.name}</option>)}</select></div>
                </div> : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                  <Select value={queueView || ALL_QUEUE_VIEWS} onValueChange={(value) => setQueueView(value === ALL_QUEUE_VIEWS ? "" : value)}>
                    <SelectTrigger aria-label="Queue view" className="rounded-xl bg-gray-50 border-gray-200">
                      <SelectValue placeholder="Queue view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_QUEUE_VIEWS}>All tickets</SelectItem>
                      <SelectItem value="new">New activity</SelectItem>
                      <SelectItem value="owned">Owned by me</SelectItem>
                      {canWriteSupport ? <SelectItem value="awaiting">Awaiting my response</SelectItem> : <SelectItem value="support">Awaiting support</SelectItem>}
                      <SelectItem value="unassigned">Unassigned active</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter || ALL_STATUSES} onValueChange={(value) => setStatusFilter(value === ALL_STATUSES ? "" : value)}>
                    <SelectTrigger aria-label="Filter by status" className="rounded-xl bg-gray-50 border-gray-200">
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
                  <Select value={priorityFilter || "__all_priorities"} onValueChange={(value) => setPriorityFilter(value === "__all_priorities" ? "" : value)}>
                    <SelectTrigger aria-label="Filter by priority" className="rounded-xl bg-gray-50 border-gray-200"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent><SelectItem value="__all_priorities">All priorities</SelectItem><SelectItem value="Urgent">Urgent</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Low">Low</SelectItem></SelectContent>
                  </Select>
                  <Select value={categoryFilter || "__all_categories"} onValueChange={(value) => setCategoryFilter(value === "__all_categories" ? "" : value)}>
                    <SelectTrigger aria-label="Filter by category" className="rounded-xl bg-gray-50 border-gray-200"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent><SelectItem value="__all_categories">All categories</SelectItem>{(["Technical", "Access", "Data", "Workflow", "Training", "Other"] as TicketCategory[]).map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={slaFilter || "__all_sla"} onValueChange={(value) => setSlaFilter(value === "__all_sla" ? "" : value)}>
                    <SelectTrigger aria-label="Filter by SLA" className="rounded-xl bg-gray-50 border-gray-200"><SelectValue placeholder="SLA" /></SelectTrigger>
                    <SelectContent><SelectItem value="__all_sla">All SLA states</SelectItem><SelectItem value="breached">Breached</SelectItem><SelectItem value="on-track">On track</SelectItem></SelectContent>
                  </Select>
                </div>
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="support-type-filter" className="mb-1 block text-xs font-medium">Ticket type</label><select id="support-type-filter" className="h-11 rounded-xl border bg-white px-3 text-sm" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All types</option><option value="Support">Support</option><option value="Incident">Incident</option></select></div>
            <div><label htmlFor="support-sort" className="mb-1 block text-xs font-medium">Sort by</label><select id="support-sort" className="h-11 rounded-xl border bg-white px-3 text-sm" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Latest activity</option><option value="oldest">Oldest first</option><option value="deadline">Resolution deadline</option><option value="priority">Highest priority</option></select></div>

          </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">{activeFilters.length ? <Button variant="ghost" onClick={clearFilters}>Clear filters ({activeFilters.length})</Button> : null}
            <div className="flex flex-wrap gap-1" role="group" aria-label="Active filters">{activeFilters.map(([key, value]) => <span key={key} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{key}: {value}</span>)}</div></div>
          <div id="support-ticket-list" aria-busy={loading} className="space-y-4 scroll-mt-6">
            {loading ? (
              [...Array(3)].map((_, index) => <Skeleton key={index} className="h-52 rounded-[2rem]" />)
            ) : ticketError ? (
              <Card><CardContent className="p-8 text-center"><p>Could not load tickets.</p><Button variant="outline" className="mt-3" onClick={() => void fetchTickets()}>Try again</Button></CardContent></Card>
            ) : visibleTickets.length === 0 ? (
              <Card className="bg-white border-none shadow-xl rounded-[2rem]">
                <CardContent className="p-12 text-center">
                  <Ticket className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="font-medium text-gray-700">{activeFilters.length ? "No tickets match these filters" : "No support tickets yet"}</p><p className="mt-1 text-sm text-gray-500">{activeFilters.length ? "Clear filters to see more requests." : "Open a ticket when you need help. Replies and progress will appear here."}</p>{activeFilters.length ? <Button variant="outline" className="mt-3" onClick={clearFilters}>Clear filters</Button> : canWriteSupport ? <Button className="mt-3" onClick={() => setTicketOpen(true)}>New ticket</Button> : null}
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
                        <h3 className="break-words text-lg font-semibold text-gray-900">{ticket.subject}</h3>
                        <p className="text-xs text-gray-500">Ticket #{ticket._id.slice(-8).toUpperCase()} · {ticket.institution || "Support"}</p>
                        <p className="mt-2 text-sm font-medium text-slate-700">{nextAction(ticket)}</p>
                        <p className={`mt-1 text-xs ${ticket.slaStatus?.hasBreach ? "font-medium text-red-700" : "text-slate-500"}`}>{deadlineLabel(ticket)}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Opened by {ticket.requester.name} on {new Date(ticket.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {getPriorityBadge(ticket.priority)}
                        {ticket._id === deepLinkedTicketId ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Focused ticket</Badge>
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

                        {getStatusBadge(ticket.status)}
                        <Button variant="outline" size="sm" aria-expanded={expandedTicketId === ticket._id} onClick={() => { const next = new URLSearchParams(searchParams); if (expandedTicketId === ticket._id) { setExpandedTicketId(null); next.delete("ticket") } else { setExpandedTicketId(ticket._id); next.set("ticket", ticket._id) } setSearchParams(next, { replace: true }) }}>{expandedTicketId === ticket._id ? "Hide details" : "View details"}</Button>
                        {ticket.hasUnreadChanges && !ticket.archivedAt ? (
                          <Button variant="outline" size="sm" className="rounded-xl" disabled={pending[`read:${ticket._id}`]} onClick={() => handleMarkSeen(ticket._id)}>
                            {pending[`read:${ticket._id}`] ? "Saving…" : "Mark seen"}
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
                  {expandedTicketId === ticket._id ? <CardContent className="p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>Category: {ticket.category} · {ticket.region || "Region not recorded"}</span><Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/support-center?ticket=${ticket._id}`).then(() => toast.success("Ticket link copied")).catch(() => toast.error("Could not copy link"))}>Copy ticket link</Button></div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-700 leading-relaxed">{ticket.description}</p>
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

                    <div className="space-y-3">
                      <h4 className="font-black text-gray-900">Replies</h4>
                      {ticket.resolutionSummary ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>{["Open", "InProgress"].includes(ticket.status) ? "Previous resolution:" : "Resolution:"}</strong> {ticket.resolutionSummary}</div> : null}
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
                            <p className="whitespace-pre-wrap break-words text-sm text-gray-600 mt-2 leading-relaxed">{reply.message}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {canWriteSupport && !ticket.archivedAt && !["Resolved", "Closed"].includes(ticket.status) ? <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-3">
                      <label htmlFor={`support-reply-${ticket._id}`} className="text-sm font-medium">Reply</label>
                            <Textarea
                                disabled={pending[`reply:${ticket._id}`]}
                                maxLength={10000}
                                id={`support-reply-${ticket._id}`}
                                placeholder="Add a reply or follow-up note..."
                                value={replyDrafts[ticket._id] || ""}
                                onChange={(e) => setReplyDrafts((drafts) => ({ ...drafts, [ticket._id]: e.target.value }))}
                                className="bg-white"
                              />
                      <Button disabled={!replyDrafts[ticket._id]?.trim() || pending[`reply:${ticket._id}`]} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => handleReply(ticket._id)}>
                        <SendHorizonal className="h-4 w-4 mr-2" />
                        {pending[`reply:${ticket._id}`] ? "Sending…" : "Send reply"}
                      </Button>
                    </div> : null}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Evidence & Attachments</p>
                          <p className="text-sm text-gray-600 mt-1">Upload supporting files for this ticket thread.</p>
                        </div>
                      </div>
                      <DocumentList documents={ticket.documents || []} onDelete={canWriteSupport && !ticket.archivedAt && !["Resolved", "Closed"].includes(ticket.status) ? fetchTickets : undefined} />
                      {canWriteSupport && !ticket.archivedAt && !["Resolved", "Closed"].includes(ticket.status) ? <DocumentUpload
                        supportTicketId={ticket._id}
                        placementId={ticket.placement?._id}
                        learnerId={ticket.learner?._id}
                        defaultCategory={ticket.ticketType === "Incident" ? "Incident Evidence" : "Support Attachment"}
                        categories={ticket.ticketType === "Incident" ? ["Incident Evidence", "Report", "Other"] : ["Support Attachment", "Report", "Other"]}
                        onUploadSuccess={fetchTickets}
                      /> : null}
                    </div>

                    <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Ownership, escalation & response targets</summary>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Assignment</p>
                        <p className="text-sm font-bold text-gray-900">{ticket.assignedTo ? `${ticket.assignedTo.name} (${ticket.assignedTo.role})` : "Unassigned"}</p>
                        {canManageTickets && !ticket.archivedAt && !["Resolved", "Closed"].includes(ticket.status) ? (
                          <div className="flex flex-col md:flex-row gap-2">
                            <Select value={assignmentDrafts[ticket._id] ?? ticket.assignedTo?._id ?? "__unassigned"} onValueChange={(value) => setAssignmentDrafts((current) => ({ ...current, [ticket._id]: value === "__unassigned" ? "" : value }))}>
                              <SelectTrigger aria-label="Assign responder" className="rounded-xl bg-white border-gray-200">
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned">Unassigned</SelectItem>
                                {assigneesForTicket(ticket).map((assignee) => (
                                  <SelectItem key={assignee._id} value={assignee._id}>{assignee.name} ({assignee.role})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" className="rounded-xl" disabled={pending[`assignment:${ticket._id}`] || assignmentDrafts[ticket._id] === undefined || assignmentDrafts[ticket._id] === (ticket.assignedTo?._id || "")} onClick={() => handleAssignment(ticket._id)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              {pending[`assignment:${ticket._id}`] ? "Saving…" : "Save assignment"}
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Response targets · calendar hours</p>
                        <p className="text-sm text-gray-700">{ticket.firstRespondedAt ? `First response sent: ${new Date(ticket.firstRespondedAt).toLocaleString()}` : `First response due: ${ticket.firstResponseDueAt ? new Date(ticket.firstResponseDueAt).toLocaleString() : "Not recorded"}`}</p>
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
                      {canManageTickets && !ticket.archivedAt && !["Resolved", "Closed"].includes(ticket.status) ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Select value={escalationDrafts[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "__none"} onValueChange={(value) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: value === "__none" ? "" : value, escalationLevel: value === "__none" ? "None" : assignees.find((assignee) => assignee._id === value)?.role === "SuperAdmin" ? "HQ" : "Regional", escalationReason: current[ticket._id]?.escalationReason ?? ticket.escalationReason ?? "" } }))}>
                              <SelectTrigger aria-label="Escalation owner" className="rounded-xl bg-white border-fuchsia-200">
                                <SelectValue placeholder="Escalation owner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">No escalation owner</SelectItem>
                                {assigneesForTicket(ticket).filter((assignee) => (escalationDrafts[ticket._id]?.escalationLevel ?? ticket.escalationLevel) === "HQ" ? assignee.role === "SuperAdmin" : (escalationDrafts[ticket._id]?.escalationLevel ?? ticket.escalationLevel) === "Regional" ? assignee.role === "RegionalAdmin" : ["SuperAdmin", "RegionalAdmin"].includes(assignee.role)).map((assignee) => (
                                  <SelectItem key={assignee._id} value={assignee._id}>{assignee.name} ({assignee.role})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={escalationDrafts[ticket._id]?.escalationLevel ?? ticket.escalationLevel ?? "None"} onValueChange={(value) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: value === "None" ? "" : current[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "", escalationLevel: value as "None" | "Regional" | "HQ", escalationReason: current[ticket._id]?.escalationReason ?? ticket.escalationReason ?? "" } }))}>
                              <SelectTrigger aria-label="Escalation level" className="rounded-xl bg-white border-fuchsia-200">
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
                            aria-label="Escalation reason"
                            placeholder="Why is this ticket being escalated?"
                            value={escalationDrafts[ticket._id]?.escalationReason ?? ticket.escalationReason ?? ""}
                            onChange={(e) => setEscalationDrafts((current) => ({ ...current, [ticket._id]: { escalatedTo: current[ticket._id]?.escalatedTo ?? ticket.escalatedTo?._id ?? "", escalationLevel: current[ticket._id]?.escalationLevel ?? ticket.escalationLevel ?? "None", escalationReason: e.target.value } }))}
                            className="bg-white"
                          />
                          <Button variant="outline" className="rounded-xl border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50" disabled={pending[`escalation:${ticket._id}`] || !escalationDrafts[ticket._id]} onClick={() => handleEscalation(ticket._id)}>
                            {pending[`escalation:${ticket._id}`] ? "Saving…" : "Update escalation"}
                          </Button>
                        </>
                      ) : null}
                    </div>

                    </details>
                    {canWriteSupport && !ticket.archivedAt && (canManageTickets || ticket.assignedTo?._id === user?._id || ticket.requester._id === user?._id) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {(ticket.requester._id === user?._id && !canManageTickets && ticket.assignedTo?._id !== user?._id
                          ? (["Resolved", "Closed"].includes(ticket.status) ? ([ticket.status === "Resolved" ? "Closed" : "Open", "Open"] as TicketStatus[]) : [] as TicketStatus[])
                          : (["Open", "InProgress", "Resolved", "Closed"] as TicketStatus[])).filter((status, index, all) => status !== ticket.status && all.indexOf(status) === index && (status !== "Closed" || ticket.status === "Resolved") && (status !== "Resolved" || !["Resolved", "Closed"].includes(ticket.status))).map((status) => (
                          <Button
                            key={status}
                            variant={ticket.status === status ? "default" : "outline"}
                            className={`rounded-xl ${ticket.status === status ? "bg-[#FFB800] text-gray-900 hover:bg-[#e5a600]" : ""}`}
                            disabled={pending[`status:${ticket._id}`]}
                            onClick={() => handleStatusChange(ticket._id, status)}
                          >
                            {pending[`status:${ticket._id}`] ? "Saving…" : status === "InProgress" ? "Start work" : status === "Open" ? ["Resolved", "Closed"].includes(ticket.status) ? "Reopen ticket" : "Mark open" : status === "Resolved" ? "Resolve ticket" : "Confirm closure"}
                          </Button>
                        ))}
                      </div>
                    )}

                    <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Ticket activity</summary><ol className="mt-3 space-y-3 text-sm"><li><time className="text-xs text-slate-500">{new Date(ticket.createdAt).toLocaleString()}</time><p>Ticket opened by {ticket.requester.name}</p></li>{ticket.activity?.map(event => <li key={event._id}><time className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</time><p><strong>{event.actorName}</strong> · {event.detail}</p></li>)}</ol><p className="mt-3 text-xs text-slate-500">Earlier handoffs may not have been recorded. Replies are shown in the conversation above.</p></details>

                  </CardContent> : null}
                </Card>
              ))
            )}
          </div>
          {!loading ? (
            <div className="flex flex-col gap-3 rounded-[2rem] border border-gray-100 bg-white px-6 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-gray-500">
                Showing {ticketTotal === 0 ? 0 : (ticketPage - 1) * ticketPageSize + 1}-
                {Math.min(ticketPage * ticketPageSize, ticketTotal)} of {ticketTotal} tickets
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={ticketPage <= 1}
                  onClick={() => setTicketPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </Button>
                <span className="min-w-[96px] text-center text-sm font-medium text-gray-600">
                  Page {ticketTotal === 0 ? 0 : ticketPage} of {ticketTotalPages}
                </span>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={ticketPage >= ticketTotalPages || ticketTotal === 0}
                  onClick={() => setTicketPage((current) => Math.min(current + 1, ticketTotalPages))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}


        </TabsContent>
      </Tabs>
    </div>
  )
}
