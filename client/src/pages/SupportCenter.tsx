import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { BookOpen, ChevronDown, CircleHelp, Headset, LifeBuoy, MessageSquarePlus, SendHorizonal, Ticket } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

type RoleKey = "SuperAdmin" | "RegionalAdmin" | "Admin" | "Manager" | "Staff" | "IndustryPartner"
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
  category: TicketCategory
  priority: TicketPriority
  description: string
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
  replies: SupportReply[]
}

const ALL_STATUSES = "__all_statuses"

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
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState("")
  const [newTicket, setNewTicket] = useState({
    subject: "",
    category: "Technical" as TicketCategory,
    priority: "Medium" as TicketPriority,
    description: "",
  })

  const role = (user?.role || "Staff") as RoleKey
  const canManageTickets = role === "SuperAdmin" || role === "RegionalAdmin" || role === "Admin"

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

  const visibleGuides = ROLE_GUIDES[role] || ROLE_GUIDES.Staff

  const ticketStats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "Open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "InProgress").length,
    resolved: tickets.filter((ticket) => ticket.status === "Resolved").length,
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
      setTicketOpen(false)
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

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
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

      <Tabs defaultValue="guides" className="w-full">
        <TabsList className="bg-gray-100/70 p-1 rounded-2xl inline-flex h-auto">
          <TabsTrigger value="guides" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">Role Guides</TabsTrigger>
          <TabsTrigger value="faq" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">FAQ</TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-xl px-5 py-2.5 font-bold data-[state=active]:bg-white">Support Tickets</TabsTrigger>
        </TabsList>

        <TabsContent value="guides" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-gradient-to-br from-[#FFB800]/10 via-white to-amber-50 border-none shadow-xl rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[#FFB800]" />
                  Guide for {role}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {visibleGuides.map((guide) => (
                  <div key={guide.title} className="rounded-2xl bg-white border border-gray-100 p-5">
                    <h3 className="font-black text-gray-900">{guide.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{guide.summary}</p>
                    <div className="mt-4 space-y-2">
                      {guide.steps.map((step, index) => (
                        <div key={step} className="flex items-start gap-3 text-sm text-gray-700">
                          <span className="w-6 h-6 rounded-full bg-[#FFB800]/15 text-[#B78100] font-black flex items-center justify-center shrink-0">{index + 1}</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white border-none shadow-xl rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Headset className="h-5 w-5 text-indigo-500" />
                  Support Workflow Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  "Search the FAQ first for known workflow answers.",
                  "Open one ticket per issue so replies stay focused.",
                  "Use High or Urgent only when work is blocked.",
                  "Reply on the existing ticket when support asks follow-up questions.",
                ].map((tip) => (
                  <div key={tip} className="p-4 rounded-2xl bg-gray-50 text-sm font-medium text-gray-700 border border-gray-100">
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
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28 rounded-[2rem]" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Total Tickets</p><p className="text-3xl font-black text-gray-900">{ticketStats.total}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Open</p><p className="text-3xl font-black text-amber-600">{ticketStats.open}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">In Progress</p><p className="text-3xl font-black text-blue-600">{ticketStats.inProgress}</p></CardContent></Card>
              <Card className="bg-white border-none shadow-xl rounded-[2rem]"><CardContent className="p-6"><p className="text-sm text-gray-500">Resolved</p><p className="text-3xl font-black text-emerald-600">{ticketStats.resolved}</p></CardContent></Card>
            </div>
          )}

          <Card className="bg-white border-none shadow-xl rounded-[2rem]">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-500">
                    Tickets stay scoped to your role. Replies and status changes are tracked on the same ticket thread.
                  </p>
                </div>
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
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loading ? (
              [...Array(3)].map((_, index) => <Skeleton key={index} className="h-52 rounded-[2rem]" />)
            ) : tickets.length === 0 ? (
              <Card className="bg-white border-none shadow-xl rounded-[2rem]">
                <CardContent className="p-12 text-center">
                  <Ticket className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="font-medium text-gray-500">No support tickets found</p>
                </CardContent>
              </Card>
            ) : (
              tickets.map((ticket) => (
                <Card key={ticket._id} className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden">
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
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{ticket.category}</Badge>
                        {getStatusBadge(ticket.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="text-sm text-gray-700 leading-relaxed">{ticket.description}</p>
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
