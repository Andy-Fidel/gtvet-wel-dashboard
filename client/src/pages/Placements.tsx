import {
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"

import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditPlacementForm } from "./EditPlacementForm"
import { UnifiedPlacementForm } from "./UnifiedPlacementForm"
import { DataTable } from "@/components/ui/data-table"
import { type Placement, columns } from "./placements-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Download, Plus, AlignLeft, Building2, Users as UsersIcon, ClipboardList } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlacementMessagesDialog } from "@/components/PlacementMessagesDialog"
import { DocumentList } from "@/components/DocumentList"
import { ConfirmationDialog } from "@/components/ConfirmationDialog"
import { PromptDialog } from "@/components/PromptDialog"
import { Handshake, Search as SearchIcon, Loader2, X } from "lucide-react"
import { Input } from "@/components/ui/input"

type DelegateUser = {
  _id: string;
  name: string;
  role: string;
  institution: string;
};

export type PlacementRequestData = {
  _id: string;
  institution: string;
  program: string;
  requestedSlots: number;
  status: 'Submitted' | 'Regional_Approved' | 'HQ_Approved' | 'Rejected' | 'Placed' | 'SelfSourced_Submitted' | 'Under_Verification' | 'Approved' | 'Converted';
  sourceType?: 'InstitutionFound' | 'LearnerFound';
  createdAt: string;
  submittedBy: { name: string };
  partner?: { name: string; sector: string; region: string; totalSlots: number; usedSlots: number };
  learners: { _id: string; firstName: string; lastName: string; trackingId: string }[];
  selfSourcedHost?: {
    companyName?: string;
    sector?: string;
    location?: string;
    tradeArea?: string;
    town?: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
  };
  verificationNotes?: string;
  regionalComment?: string;
  hqComment?: string;
  rejectionReason?: string;
}

type PlacementsResponse = {
  items: Placement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Placements() {
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const [data, setData] = useState<Placement[]>([])
    const [delegatedData, setDelegatedData] = useState<Placement[]>([])
    const [requests, setRequests] = useState<PlacementRequestData[]>([])
    const [loading, setLoading] = useState(true)
    const [delegatedLoading, setDelegatedLoading] = useState(true)
    const [placementsPage, setPlacementsPage] = useState(1)
    const [placementsPageSize] = useState(25)
    const [placementsTotal, setPlacementsTotal] = useState(0)
    const [placementsTotalPages, setPlacementsTotalPages] = useState(0)
    const [editOpen, setEditOpen] = useState(false)
    const [newOpen, setNewOpen] = useState(false)
    const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        closureSummary: false,
        delegate: false,
        operationalReadiness: false,
        supervisorName: false,
        location: false,
    })
    const [messagesOpen, setMessagesOpen] = useState(false)
    const [activePlacementId, setActivePlacementId] = useState<string | null>(null)
    const [evidenceOpen, setEvidenceOpen] = useState(false)
    const [evidenceLoading, setEvidenceLoading] = useState(false)
    const [evidencePlacement, setEvidencePlacement] = useState<Placement | null>(null)
    const [evidenceDocuments, setEvidenceDocuments] = useState<any[]>([])
    const { authFetch, user, isLoading: authLoading } = useAuth()

    // Search & filter state
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'' | 'Active' | 'Completed' | 'Terminated'>('')
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Confirmation dialog state (replaces window.confirm)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [deletingPlacementId, setDeletingPlacementId] = useState<string | null>(null)
    const [deletingPlacementLabel, setDeletingPlacementLabel] = useState('')

    // Prompt dialog state (replaces window.prompt for self-sourced verification)
    const [verifyPromptOpen, setVerifyPromptOpen] = useState(false)
    const [verifyRequest, setVerifyRequest] = useState<PlacementRequestData | null>(null)
    const [verifyAction, setVerifyAction] = useState<'Under_Verification' | 'Approved' | 'Rejected'>('Under_Verification')
    const [selfSourcedActionLoading, setSelfSourcedActionLoading] = useState<string | null>(null)

    // Delegate assignment state
    const [delegateOpen, setDelegateOpen] = useState(false)
    const [delegatePlacement, setDelegatePlacement] = useState<Placement | null>(null)
    const [delegateCandidates, setDelegateCandidates] = useState<DelegateUser[]>([])
    const [delegateSearch, setDelegateSearch] = useState('')
    const [delegateLoading, setDelegateLoading] = useState(false)
    const [delegateSaving, setDelegateSaving] = useState(false)
    const delegatedView = searchParams.get("view") === "delegated" || location.pathname === "/delegated-placements"
    const initialTab = delegatedView ? "delegated" : "all"
    const [activeTab, setActiveTab] = useState(initialTab)

    // Debounce search input
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery)
            setPlacementsPage(1)
        }, 400)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [searchQuery])

    // Reset page on status filter change
    useEffect(() => {
        setPlacementsPage(1)
    }, [statusFilter])

    useEffect(() => {
        setActiveTab(delegatedView ? "delegated" : "all")
    }, [delegatedView])
    
    useEffect(() => {
        if (authLoading) return
        if (!user) {
            setData([])
            setDelegatedData([])
            setRequests([])
            setPlacementsTotal(0)
            setPlacementsTotalPages(0)
            setLoading(false)
            setDelegatedLoading(false)
            return
        }

        const fetchData = async () => {
            setLoading(true)
            setDelegatedLoading(true)
            try {
                const placementParams = new URLSearchParams({
                    page: String(placementsPage),
                    pageSize: String(placementsPageSize),
                })
                if (debouncedSearch) placementParams.set('search', debouncedSearch)
                if (statusFilter) placementParams.set('status', statusFilter)

                const [placementsRes, requestsRes, delegatedRes] = await Promise.all([
                    authFetch(`/api/placements?${placementParams.toString()}`),
                    authFetch('/api/placement-requests'),
                    authFetch('/api/placements/delegated-to-me'),
                ])
                const [placementsData, requestsData, delegatedDataPayload] = await Promise.all([
                    placementsRes.json().catch(() => null),
                    requestsRes.json().catch(() => null)
                    ,
                    delegatedRes.json().catch(() => null)
                ])

                if (!placementsRes.ok) {
                    throw new Error(
                        (placementsData as { message?: string } | null)?.message || "Failed to load placements"
                    )
                }

                if (!requestsRes.ok) {
                    throw new Error(
                        (requestsData as { message?: string } | null)?.message || "Failed to load placement requests"
                    )
                }

                if (!delegatedRes.ok) {
                    throw new Error(
                        (delegatedDataPayload as { message?: string } | null)?.message || "Failed to load delegated placements"
                    )
                }

                const placementsPayload = placementsData as PlacementsResponse | null
                setData(Array.isArray(placementsPayload?.items) ? placementsPayload.items : [])
                setDelegatedData(Array.isArray(delegatedDataPayload) ? delegatedDataPayload : [])
                setPlacementsTotal(typeof placementsPayload?.total === "number" ? placementsPayload.total : 0)
                setPlacementsTotalPages(typeof placementsPayload?.totalPages === "number" ? placementsPayload.totalPages : 0)
                setRequests(Array.isArray(requestsData) ? requestsData : [])
            } catch (err) {
                console.error(err)
                setData([])
                setDelegatedData([])
                setRequests([])
                setPlacementsTotal(0)
                setPlacementsTotalPages(0)
                toast.error(err instanceof Error ? err.message : "Failed to load placement data")
            } finally {
                setLoading(false)
                setDelegatedLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch, authLoading, user, placementsPage, placementsPageSize, debouncedSearch, statusFilter])

    const handleEditSuccess = () => {
        setEditOpen(false)
        setEditingPlacement(null)
        setRefreshKey(prev => prev + 1)
        toast.success("Placement updated successfully")
    }

    const handleNewSuccess = () => {
        setNewOpen(false)
        setPlacementsPage(1)
        setRefreshKey(prev => prev + 1)
        toast.success("New placement created successfully")
    }
    
    const handleEdit = (placement: Placement) => {
        setEditingPlacement(placement)
        setEditOpen(true)
    }
    
    const handleDelete = (id: string) => {
        const placement = data.find(p => p._id === id) || delegatedData.find(p => p._id === id)
        setDeletingPlacementId(id)
        setDeletingPlacementLabel(
            placement ? `${placement.learner?.name || 'Learner'} at ${placement.companyName}` : 'this placement'
        )
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!deletingPlacementId) return
        try {
            const res = await authFetch(`/api/placements/${deletingPlacementId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error("Failed to delete")
            if (data.length === 1 && placementsPage > 1) {
                setPlacementsPage(prev => prev - 1)
            } else {
                setRefreshKey(prev => prev + 1)
            }
            toast.success("Placement deleted successfully")
        } catch (error) {
            console.error("Error deleting placement:", error)
            toast.error("Failed to delete placement")
        } finally {
            setDeleteConfirmOpen(false)
            setDeletingPlacementId(null)
        }
    }

    const handleOpenMessages = (placement: Placement) => {
        setActivePlacementId(placement._id)
        setMessagesOpen(true)
    }

    const handleMessageCreated = useCallback((placementId: string, createdAt: string) => {
        setData((current) =>
            current.map((placement) =>
                placement._id === placementId
                    ? {
                        ...placement,
                        messageCount: (placement.messageCount || 0) + 1,
                        lastMessageAt: createdAt,
                        unreadMessageCount: 0,
                    }
                    : placement
            )
        )
        setDelegatedData((current) =>
            current.map((placement) =>
                placement._id === placementId
                    ? {
                        ...placement,
                        messageCount: (placement.messageCount || 0) + 1,
                        lastMessageAt: createdAt,
                        unreadMessageCount: 0,
                    }
                    : placement
            )
        )
    }, [])

    const handleConversationRead = useCallback((placementId: string) => {
        setData((current) =>
            current.map((placement) =>
                placement._id === placementId
                    ? { ...placement, unreadMessageCount: 0 }
                    : placement
            )
        )
        setDelegatedData((current) =>
            current.map((placement) =>
                placement._id === placementId
                    ? { ...placement, unreadMessageCount: 0 }
                    : placement
            )
        )
    }, [])

    const handleOpenEvidence = async (placement: Placement) => {
        setEvidencePlacement(placement)
        setEvidenceOpen(true)
        setEvidenceLoading(true)
        try {
            const res = await authFetch(`/api/placements/${placement._id}/evidence`)
            if (!res.ok) throw new Error("Failed to fetch placement evidence")
            const payload = await res.json()
            setEvidenceDocuments(payload.evidence || [])
        } catch (error) {
            console.error("Error fetching placement evidence:", error)
            toast.error("Failed to load placement evidence")
            setEvidenceDocuments([])
        } finally {
            setEvidenceLoading(false)
        }
    }

    const handleAssignDelegate = async (placement: Placement) => {
        setDelegatePlacement(placement)
        setDelegateOpen(true)
        setDelegateSearch('')
        setDelegateCandidates([])

        if (!placement.placementRegion) {
            toast.warning("Please set the placement region on this placement first (edit the placement and add the region).")
            return
        }

        setDelegateLoading(true)
        try {
            const res = await authFetch(`/api/users/by-region/${encodeURIComponent(placement.placementRegion)}`)
            if (!res.ok) throw new Error("Failed to fetch users")
            const users = await res.json()
            setDelegateCandidates(users)
        } catch {
            toast.error("Failed to load users in the placement region")
        } finally {
            setDelegateLoading(false)
        }
    }

    const handleSelectDelegate = async (delegateId: string) => {
        if (!delegatePlacement) return
        setDelegateSaving(true)
        try {
            const res = await authFetch(`/api/placements/${delegatePlacement._id}/delegate`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delegateId }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.message || 'Failed to assign delegate')
            }
            toast.success("Delegate assigned successfully")
            setDelegateOpen(false)
            setRefreshKey(prev => prev + 1)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to assign delegate")
        } finally {
            setDelegateSaving(false)
        }
    }

    const handleRemoveDelegate = async () => {
        if (!delegatePlacement) return
        setDelegateSaving(true)
        try {
            const res = await authFetch(`/api/placements/${delegatePlacement._id}/delegate`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delegateId: null }),
            })
            if (!res.ok) throw new Error('Failed to remove delegate')
            toast.success("Delegate removed")
            setDelegateOpen(false)
            setRefreshKey(prev => prev + 1)
        } catch {
            toast.error("Failed to remove delegate")
        } finally {
            setDelegateSaving(false)
        }
    }

    const handleExport = async () => {
        try {
            toast.info("Preparing export...");
            const res = await authFetch('/api/placements/export');
            if (!res.ok) throw new Error("Failed to export");
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `placements_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Export downloaded successfully");
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export data");
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
          case 'Submitted': return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Submitted</Badge>
          case 'SelfSourced_Submitted': return <Badge className="bg-sky-100 text-sky-800 border-sky-200">Learner Found</Badge>
          case 'Under_Verification': return <Badge className="bg-violet-100 text-violet-800 border-violet-200">Verifying</Badge>
          case 'Approved': return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Approved</Badge>
          case 'Converted': return <Badge className="bg-teal-100 text-teal-800 border-teal-200">Converted</Badge>
          case 'Regional_Approved': return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Regional OK</Badge>
          case 'HQ_Approved': 
          case 'Placed': return <Badge className="bg-green-100 text-green-800 border-green-200">Placed</Badge>
          case 'Rejected': return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>
          default: return <Badge variant="outline">{status}</Badge>
        }
    }

    const handleUpdateSelfSourcedStatus = (request: PlacementRequestData, status: "Under_Verification" | "Approved" | "Rejected") => {
        if (status === 'Under_Verification') {
            // Start Verification can go direct — no notes needed
            submitSelfSourcedStatus(request, 'Under_Verification', '', '')
            return
        }
        setVerifyRequest(request)
        setVerifyAction(status)
        setVerifyPromptOpen(true)
    }

    const submitSelfSourcedStatus = async (request: PlacementRequestData, status: "Under_Verification" | "Approved" | "Rejected", verificationNotes: string, rejectionReason: string) => {
        setSelfSourcedActionLoading(request._id)
        try {
            const res = await authFetch(`/api/placement-requests/${request._id}/self-source-status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, verificationNotes, rejectionReason }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to update learner-sourced placement")
            toast.success(status === "Rejected" ? "Learner-sourced placement rejected" : `Marked as ${status.replace("_", " ").toLowerCase()}`)
            setRefreshKey((prev) => prev + 1)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update learner-sourced placement")
        } finally {
            setSelfSourcedActionLoading(null)
        }
    }

    // Convert handler state (replaces window.confirm)
    const [convertConfirmOpen, setConvertConfirmOpen] = useState(false)
    const [convertRequest, setConvertRequest] = useState<PlacementRequestData | null>(null)

    const handleConvertSelfSourcedPlacement = (request: PlacementRequestData) => {
        setConvertRequest(request)
        setConvertConfirmOpen(true)
    }

    const confirmConvert = async () => {
        if (!convertRequest) return
        setSelfSourcedActionLoading(convertRequest._id)
        try {
            const res = await authFetch(`/api/placement-requests/${convertRequest._id}/convert`, {
                method: "POST",
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to convert learner-sourced placement")
            toast.success("Learner-sourced placement converted successfully")
            setRefreshKey((prev) => prev + 1)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to convert learner-sourced placement")
        } finally {
            setSelfSourcedActionLoading(null)
            setConvertConfirmOpen(false)
            setConvertRequest(null)
        }
    }

    const handleTabChange = (nextTab: string) => {
        setActiveTab(nextTab)
        const nextParams = new URLSearchParams(searchParams)
        if (nextTab === "delegated") nextParams.set("view", "delegated")
        else nextParams.delete("view")
        setSearchParams(nextParams, { replace: true })
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-6 pt-12 md:pt-16 pb-4 md:pb-8 flex w-full relative z-0">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 px-4 md:px-8">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                    {delegatedView ? "Delegated Placements" : "Placements Hub"}
                  </h2>
                  <p className="text-muted-foreground text-sm font-medium mt-1">
                      {delegatedView
                        ? "Manage cross-region placements assigned to you for monitoring follow-up."
                        : "Manage all individual and batch workplace placements."}
                  </p>
                </div>
                <div className="flex items-center space-x-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <Button onClick={handleExport} variant="outline" className="rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm font-semibold shrink-0">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                    
                    {user?.role !== 'RegionalAdmin' && user?.role !== 'SuperAdmin' && (
                        <Button data-help-id="placements-new" onClick={() => setNewOpen(true)} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-bold h-10 px-6 rounded-xl shadow-sm shrink-0">
                            <Plus className="mr-2 h-4 w-4" /> New Placement
                        </Button>
                    )}
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                    <DialogTitle>Edit Placement</DialogTitle>
                    <DialogDescription>Update the placement details for this learner.</DialogDescription>
                    </DialogHeader>
                    {editingPlacement && <EditPlacementForm onSuccess={handleEditSuccess} initialData={editingPlacement} />}
                </DialogContent>
            </Dialog>

            {/* New Unified Placement Dialog */}
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[700px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0 max-h-[90vh] overflow-y-auto">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-black">Initiate Placement Workflow</DialogTitle>
                            <DialogDescription className="font-medium text-gray-500">
                                Place learners directly with a registered partner or a custom organization.
                            </DialogDescription>
                        </DialogHeader>
                        <UnifiedPlacementForm onSuccess={handleNewSuccess} />
                    </div>
                </DialogContent>
            </Dialog>

            <PlacementMessagesDialog
                open={messagesOpen}
                onOpenChange={setMessagesOpen}
                placementId={activePlacementId}
                authFetch={authFetch}
                currentUserId={user?._id}
                onMessageCreated={handleMessageCreated}
                onConversationRead={handleConversationRead}
            />

            <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
                <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[900px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0 max-h-[90vh] overflow-y-auto">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-black">Placement Evidence</DialogTitle>
                            <DialogDescription className="font-medium text-gray-500">
                                {evidencePlacement
                                  ? `${evidencePlacement.companyName} · ${evidencePlacement.learner?.name || "Learner"}`
                                  : "Placement evidence and operational attachments"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="rounded-[2rem] border border-violet-100 bg-violet-50/40 p-6">
                            <DocumentList documents={evidenceDocuments} onDelete={() => evidencePlacement && handleOpenEvidence(evidencePlacement)} loading={evidenceLoading} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex-1 w-full relative z-0 px-4 md:px-8 max-w-full">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="bg-gray-100/50 p-1 rounded-2xl mb-6 inline-flex max-w-full overflow-x-auto">
                        <TabsTrigger value="all" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 transition-all shrink-0">
                            All Placements
                        </TabsTrigger>
                        <TabsTrigger value="delegated" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 transition-all shrink-0">
                            Delegated to Me
                        </TabsTrigger>
                        <TabsTrigger value="batches" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 transition-all shrink-0">
                            Placement Batches / History
                        </TabsTrigger>
                    </TabsList>


                    <TabsContent value="all" className="mt-0 outline-none space-y-4">
                        {/* Search & Filter Bar */}
                        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                            <div className="relative flex-1 w-full md:max-w-md">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by learner, tracking ID, or company..."
                                    value={searchQuery}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                    className="h-10 pl-9 rounded-xl border-gray-200 bg-white shadow-sm"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {([
                                    { value: '' as const, label: 'All' },
                                    { value: 'Active' as const, label: 'Active' },
                                    { value: 'Completed' as const, label: 'Completed' },
                                    { value: 'Terminated' as const, label: 'Terminated' },
                                ] as { value: '' | 'Active' | 'Completed' | 'Terminated'; label: string }[]).map(chip => (
                                    <button
                                        key={chip.label}
                                        type="button"
                                        onClick={() => setStatusFilter(chip.value)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                            statusFilter === chip.value
                                                ? chip.value === 'Active' ? 'bg-green-100 text-green-800 border-green-200'
                                                  : chip.value === 'Completed' ? 'bg-blue-100 text-blue-800 border-blue-200'
                                                  : chip.value === 'Terminated' ? 'bg-red-100 text-red-800 border-red-200'
                                                  : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Health Summary Strip */}
                        {!loading && data.length > 0 && (() => {
                            const scored = data.filter(p => p.healthScore);
                            if (scored.length === 0) return null;
                            const avgScore = Math.round(scored.reduce((s, p) => s + (p.healthScore?.score || 0), 0) / scored.length);
                            const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
                            scored.forEach(p => {
                                const g = p.healthScore?.grade || 'F';
                                if (g in gradeCount) gradeCount[g as keyof typeof gradeCount]++;
                            });
                            const criticalCount = gradeCount.D + gradeCount.F;
                            const avgGrade = avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : avgScore >= 20 ? 'D' : 'F';
                            const avgColor = avgGrade === 'A' ? 'text-emerald-600' : avgGrade === 'B' ? 'text-blue-600' : avgGrade === 'C' ? 'text-amber-600' : 'text-red-600';
                            return (
                                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-4">
                                    <div className="flex flex-wrap items-center gap-6 lg:gap-10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-emerald-50 rounded-xl">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Avg Health</p>
                                                <p className={`text-xl font-black ${avgColor}`}>{avgScore}<span className="text-sm opacity-70 ml-0.5">/{100}</span></p>
                                            </div>
                                        </div>
                                        <div className="h-10 w-px bg-gray-100 hidden lg:block" />
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {([['A', 'bg-emerald-100 text-emerald-700'], ['B', 'bg-blue-100 text-blue-700'], ['C', 'bg-amber-100 text-amber-700'], ['D', 'bg-orange-100 text-orange-700'], ['F', 'bg-red-100 text-red-700']] as const).map(([grade, cls]) => (
                                                <span key={grade} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${cls}`}>
                                                    {grade}: {gradeCount[grade]}
                                                </span>
                                            ))}
                                        </div>
                                        {criticalCount > 0 && (
                                            <>
                                                <div className="h-10 w-px bg-gray-100 hidden lg:block" />
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-50 border border-red-100">
                                                    <span className="text-xs font-black text-red-600">{criticalCount} critical</span>
                                                    <span className="text-[10px] font-bold text-red-400">need attention</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        <div data-help-id="placements-table" className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden w-full relative z-0">
                            {loading ? (
                                <div className="p-4 space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : data.length === 0 ? (
                                <div className="p-16 text-center">
                                    <ClipboardList className="mx-auto h-14 w-14 text-gray-300" />
                                    <h3 className="mt-4 text-xl font-black text-gray-500 tracking-tight">
                                        {debouncedSearch || statusFilter ? 'No placements match your search' : 'No placements yet'}
                                    </h3>
                                    <p className="mt-2 text-sm font-medium text-gray-400">
                                        {debouncedSearch || statusFilter
                                            ? 'Try adjusting your search terms or clearing the filters.'
                                            : 'Create your first placement using the "New Placement" button above.'}
                                    </p>
                                    {(debouncedSearch || statusFilter) && (
                                        <Button
                                            variant="outline"
                                            className="mt-4 rounded-xl"
                                            onClick={() => { setSearchQuery(''); setStatusFilter('') }}
                                        >
                                            Clear Filters
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full relative z-0 space-y-4">
                                    <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
                                        <div className="text-sm font-medium text-gray-500">
                                            Showing {data.length === 0 ? 0 : ((placementsPage - 1) * placementsPageSize) + 1}
                                            {" "}-{" "}
                                            {Math.min(placementsPage * placementsPageSize, placementsTotal)}
                                            {" "}of{" "}
                                            <span className="font-bold text-gray-900">{placementsTotal}</span> placements
                                        </div>
                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => setPlacementsPage((prev) => Math.max(prev - 1, 1))}
                                                disabled={placementsPage <= 1}
                                            >
                                                Previous
                                            </Button>
                                            <span className="min-w-[120px] text-center text-sm font-semibold text-gray-600">
                                                Page {placementsPage} of {Math.max(placementsTotalPages, 1)}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => setPlacementsPage((prev) => Math.min(prev + 1, Math.max(placementsTotalPages, 1)))}
                                                disabled={placementsPage >= placementsTotalPages}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="w-full" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                                        <DataTable 
                                            exportTitle="Learner Placements Export"
                                            data={data}
                                            disablePagination
                                            columns={columns} 
                                            meta={{ 
                                                onEdit: handleEdit, 
                                                onDelete: handleDelete,
                                                onOpenMessages: handleOpenMessages,
                                                onOpenEvidence: handleOpenEvidence,
                                                onAssignDelegate: handleAssignDelegate,
                                                role: user?.role
                                            }} 
                                            sorting={sorting}
                                            onSortingChange={setSorting}
                                            columnVisibility={columnVisibility}
                                            onColumnVisibilityChange={setColumnVisibility}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="delegated" className="mt-0 outline-none space-y-4">
                        <Card className="rounded-2xl border border-amber-100 bg-amber-50/60 shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-amber-900">
                                    <Handshake className="h-5 w-5 text-amber-600" />
                                    Cross-Region Delegated Placements
                                </CardTitle>
                                <CardDescription className="text-amber-800/80">
                                    These are active placements assigned to you to handle monitoring visits on behalf of the originating institution.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900">
                                    <span>Delegated placements:</span>
                                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">{delegatedData.length}</Badge>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden w-full relative z-0">
                            {delegatedLoading ? (
                                <div className="p-4 space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : delegatedData.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Handshake className="mx-auto h-12 w-12 text-amber-300" />
                                    <h3 className="mt-4 text-xl font-black text-gray-900">No delegated placements</h3>
                                    <p className="mt-2 text-sm font-medium text-gray-500">
                                        When another institution assigns you as a regional liaison officer, the placement will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="w-full" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                                    <DataTable
                                        exportTitle="Delegated Placements Export"
                                        data={delegatedData}
                                        columns={columns}
                                        meta={{
                                            onEdit: handleEdit,
                                            onDelete: handleDelete,
                                            onOpenMessages: handleOpenMessages,
                                            onOpenEvidence: handleOpenEvidence,
                                            onAssignDelegate: handleAssignDelegate,
                                            role: user?.role
                                        }}
                                        sorting={sorting}
                                        onSortingChange={setSorting}
                                        columnVisibility={columnVisibility}
                                        onColumnVisibilityChange={setColumnVisibility}
                                    />
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="batches" className="mt-0 outline-none">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                <Skeleton className="h-[200px] w-full rounded-[2rem]" />
                                <Skeleton className="h-[200px] w-full rounded-[2rem]" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="w-full text-center p-16 bg-white/50 border border-dashed border-gray-300 rounded-[2.5rem]">
                            <AlignLeft className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-gray-500 tracking-tight">No batches found</h3>
                            <p className="text-gray-400 mt-2 font-medium">Placement batch records will appear here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                            {requests.map(req => (
                                <Card key={req._id} className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-2xl overflow-hidden group">
                                <div className={`h-2 w-full ${req.status === 'Rejected' ? 'bg-red-400' : req.status === 'Placed' || req.status === 'HQ_Approved' || req.status === 'Approved' || req.status === 'Converted' ? 'bg-green-400' : req.status === 'Under_Verification' ? 'bg-violet-400' : 'bg-amber-400'}`} />
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start gap-4">
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="text-lg md:text-xl font-black text-gray-900 truncate" title={req.sourceType === 'LearnerFound' ? (req.selfSourcedHost?.companyName || 'Learner-Sourced Lead') : (req.partner?.name || 'Custom Placement')}>
                                            {req.sourceType === 'LearnerFound' ? (req.selfSourcedHost?.companyName || 'Learner-Sourced Lead') : (req.partner?.name || 'Custom Placement')}
                                        </CardTitle>
                                        <CardDescription className="text-xs md:text-sm font-semibold mt-1 flex items-center gap-1.5 truncate">
                                            <Building2 className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" /> <span className="truncate">{req.institution}</span>
                                        </CardDescription>
                                    </div>
                                    <div className="flex-shrink-0">
                                        {getStatusBadge(req.status)}
                                    </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-2">
                                    <div className="flex flex-wrap gap-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <div className="w-full flex justify-between mb-1 items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Program</span>
                                        <span className="font-bold text-gray-900 truncate max-w-[150px] text-right">{req.program}</span>
                                    </div>
                                    <div className="w-full flex justify-between mb-1 items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Learners</span>
                                        <span className="font-bold text-gray-900 flex items-center gap-1"><UsersIcon className="h-3 w-3 md:h-4 md:w-4"/> {req.requestedSlots}</span>
                                    </div>
                                    {req.sourceType === 'LearnerFound' ? (
                                      <>
                                        <div className="w-full flex justify-between mb-1 items-center">
                                            <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Source</span>
                                            <span className="font-bold text-teal-700 text-xs md:text-sm">Learner Found</span>
                                        </div>
                                        <div className="w-full flex justify-between mb-1 items-center">
                                            <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Location</span>
                                            <span className="font-bold text-gray-900 text-xs md:text-sm text-right max-w-[170px] truncate">{req.selfSourcedHost?.location || req.selfSourcedHost?.town || 'Not set'}</span>
                                        </div>
                                      </>
                                    ) : null}
                                    <div className="w-full flex justify-between items-center">
                                        <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-wider">Date</span>
                                        <span className="font-bold text-gray-900 text-xs md:text-sm">{new Date(req.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    </div>

                                    {req.sourceType === 'LearnerFound' && (
                                        <div className="bg-teal-50 text-teal-800 p-3 rounded-xl text-xs md:text-sm font-medium border border-teal-100 space-y-1">
                                            <p><strong>Trade Area:</strong> {req.selfSourcedHost?.tradeArea || 'Not set'}</p>
                                            <p><strong>Town:</strong> {req.selfSourcedHost?.town || 'Not set'}</p>
                                            <p><strong>Contact:</strong> {req.selfSourcedHost?.contactPerson || req.selfSourcedHost?.contactPhone || req.selfSourcedHost?.contactEmail ? `${req.selfSourcedHost?.contactPerson || 'Contact'} · ${req.selfSourcedHost?.contactPhone || 'No phone'}${req.selfSourcedHost?.contactEmail ? ` · ${req.selfSourcedHost.contactEmail}` : ''}` : 'Not set'}</p>
                                            {req.verificationNotes ? <p><strong>Verification:</strong> {req.verificationNotes}</p> : null}
                                        </div>
                                    )}

                                    {req.status === 'Rejected' && req.rejectionReason && (
                                        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs md:text-sm font-medium border border-red-100">
                                            <strong className="block mb-1 text-[10px] md:text-xs uppercase tracking-wider">Rejection Reason:</strong>
                                            {req.rejectionReason}
                                        </div>
                                    )}

                                    {req.sourceType === 'LearnerFound' && user?.role !== 'SuperAdmin' && user?.role !== 'RegionalAdmin' && (
                                        <div className="flex flex-wrap gap-2">
                                            {req.status === 'SelfSourced_Submitted' ? (
                                                <Button size="sm" variant="outline" className="rounded-xl" disabled={selfSourcedActionLoading === req._id} onClick={() => handleUpdateSelfSourcedStatus(req, 'Under_Verification')}>
                                                    {selfSourcedActionLoading === req._id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                                                    Start Verification
                                                </Button>
                                            ) : null}
                                            {req.status === 'Under_Verification' ? (
                                                <>
                                                    <Button size="sm" variant="outline" className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={selfSourcedActionLoading === req._id} onClick={() => handleUpdateSelfSourcedStatus(req, 'Approved')}>
                                                        {selfSourcedActionLoading === req._id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                                                        Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={selfSourcedActionLoading === req._id} onClick={() => handleUpdateSelfSourcedStatus(req, 'Rejected')}>
                                                        {selfSourcedActionLoading === req._id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                                                        Reject
                                                    </Button>
                                                </>
                                            ) : null}
                                            {req.status === 'Approved' ? (
                                                <Button size="sm" className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white" disabled={selfSourcedActionLoading === req._id} onClick={() => handleConvertSelfSourcedPlacement(req)}>
                                                    {selfSourcedActionLoading === req._id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                                                    Convert to Placement
                                                </Button>
                                            ) : null}
                                        </div>
                                    )}
                                </CardContent>
                                </Card>
                            ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Delegate Assignment Dialog */}
            <Dialog open={delegateOpen} onOpenChange={setDelegateOpen}>
                <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[500px] overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Handshake className="h-5 w-5 text-amber-600" />
                            Assign Cross-Region Delegate
                        </DialogTitle>
                        <DialogDescription>
                            {delegatePlacement ? (
                                <>
                                    Assign a liaison officer in <strong>{delegatePlacement.placementRegion || 'the placement region'}</strong> to
                                    conduct monitoring visits for <strong>{delegatePlacement.learner?.name}</strong> at <strong>{delegatePlacement.companyName}</strong>.
                                </>
                            ) : 'Select a delegate to conduct monitoring visits.'}
                        </DialogDescription>
                    </DialogHeader>

                    {delegatePlacement?.delegate && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wider text-amber-500 mb-1">Current Delegate</p>
                                    <p className="font-bold text-amber-900">{delegatePlacement.delegate.name}</p>
                                    <p className="text-xs text-amber-700">{delegatePlacement.delegate.institution} · {delegatePlacement.delegate.role}</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={handleRemoveDelegate}
                                    disabled={delegateSaving}
                                >
                                    <X className="h-3.5 w-3.5 mr-1" /> Remove
                                </Button>
                            </div>
                        </div>
                    )}

                    {!delegatePlacement?.placementRegion ? (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                            <strong>Placement region not set.</strong> Please edit this placement and set the placement region before assigning a delegate.
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search officers by name or institution..."
                                    value={delegateSearch}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegateSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            <div className="max-h-[300px] overflow-y-auto space-y-1">
                                {delegateLoading ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                    </div>
                                ) : delegateCandidates.length === 0 ? (
                                    <div className="text-center text-sm text-gray-500 py-8">No officers found in this region.</div>
                                ) : (
                                    delegateCandidates
                                        .filter(u => {
                                            const q = delegateSearch.toLowerCase()
                                            return !q || u.name.toLowerCase().includes(q) || u.institution.toLowerCase().includes(q)
                                        })
                                        .map(u => (
                                            <button
                                                key={u._id}
                                                type="button"
                                                onClick={() => handleSelectDelegate(u._id)}
                                                disabled={delegateSaving}
                                                className="w-full text-left flex items-center justify-between p-3 rounded-xl hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-200"
                                            >
                                                <div>
                                                    <p className="font-bold text-sm text-gray-900">{u.name}</p>
                                                    <p className="text-xs text-gray-500">{u.institution} · {u.role}</p>
                                                </div>
                                                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">Select</Badge>
                                            </button>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <ConfirmationDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title="Delete Placement"
                description={`Are you sure you want to permanently delete the placement for ${deletingPlacementLabel}? This action cannot be undone.`}
                confirmLabel="Delete Placement"
                variant="danger"
                onConfirm={confirmDelete}
            />

            {/* Self-Sourced Verification / Rejection Prompt Dialog */}
            <PromptDialog
                open={verifyPromptOpen}
                onOpenChange={(open) => { setVerifyPromptOpen(open); if (!open) setVerifyRequest(null) }}
                title={verifyAction === 'Rejected' ? 'Reject Learner-Sourced Placement' : 'Approve Learner-Sourced Placement'}
                description={verifyAction === 'Rejected'
                    ? 'Provide the reason for rejecting this learner-sourced placement lead.'
                    : 'Add verification notes for this learner-sourced placement lead.'}
                label={verifyAction === 'Rejected' ? 'Rejection Reason' : 'Verification Notes'}
                placeholder={verifyAction === 'Rejected' ? 'Enter the reason for rejection...' : 'Enter verification notes...'}
                defaultValue={verifyRequest?.verificationNotes || verifyRequest?.selfSourcedHost?.notes || ''}
                required={verifyAction === 'Rejected'}
                submitLabel={verifyAction === 'Rejected' ? 'Reject' : 'Approve'}
                onSubmit={async (value) => {
                    if (verifyRequest) {
                        await submitSelfSourcedStatus(
                            verifyRequest,
                            verifyAction,
                            value,
                            verifyAction === 'Rejected' ? value : ''
                        )
                    }
                    setVerifyPromptOpen(false)
                    setVerifyRequest(null)
                }}
            />

            {/* Convert Self-Sourced to Placement Confirmation */}
            <ConfirmationDialog
                open={convertConfirmOpen}
                onOpenChange={setConvertConfirmOpen}
                title="Convert to Active Placements"
                description={convertRequest
                    ? `Convert ${convertRequest.requestedSlots} learner(s) at ${convertRequest.selfSourcedHost?.companyName || 'this company'} into active placement records?`
                    : ''}
                confirmLabel="Convert Now"
                variant="warning"
                onConfirm={confirmConvert}
            />
        </div>
    )
}
