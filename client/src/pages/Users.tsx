
import {
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, Plus, ShieldAlert, Users as UsersIcon, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserForm } from "./UserForm"
import { DataTable } from "@/components/ui/data-table"
import { type User, columns } from "./user-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { useSearchParams } from "react-router-dom"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DeactivationImpact {
    message: string
    blockers: {
        learnersOwned: Array<{ _id: string; name: string; trackingId?: string; institution?: string; status?: string }>
        activePlacementsOwned: Array<{ _id: string; companyName: string; learnerName?: string; learnerTrackingId?: string; institution?: string }>
        partnerPlacementsAssigned: Array<{ _id: string; companyName: string; learnerName?: string; learnerTrackingId?: string; institution?: string }>
        supportAssignments: Array<{ _id: string; subject: string; institution?: string }>
        supportEscalations: Array<{ _id: string; subject: string; institution?: string }>
    }
}

interface ReassignmentOptions {
    ownerCandidates: Array<{ _id: string; name: string; role: string; institution?: string }>
    supportAssignees: Array<{ _id: string; name: string; role: string; institution?: string }>
    partnerSupervisors: Array<{ _id: string; name: string; email?: string }>
}

interface AccessApprovalQueueItem {
    _id: string
    subject: string
    priority: string
    status: string
    requestType?: string
    description?: string
    institution?: string
    region?: string
    requester?: {
        name: string
        role: string
    }
    targetUser?: {
        _id: string
        name: string
        email: string
        role: User["role"]
        institution?: string
        region?: string
    } | null
    requestedRole?: User["role"] | ""
    requestedInstitution?: string
    requestedRegion?: string
    createdAt: string
    decisionComment?: string
    implementedAt?: string | null
    implementedBy?: {
        name: string
        role: string
    } | null
    implementedUser?: {
        _id: string
        name: string
        email: string
        role: User["role"]
        institution?: string
        region?: string
    } | null
}

interface BulkSuspendResult {
    userId: string
    userName: string
    status: "suspended" | "blocked" | "failed"
    message: string
    blockers?: DeactivationImpact["blockers"]
}

interface HqGovernanceOverview {
    totalUsers: number
    roleCounts: Record<string, number>
    regionStats: Array<{
        region: string
        totalUsers: number
        privilegedUsers: number
        invitedUsers: number
    }>
    riskyAccounts: {
        items: User[]
        total: number
        page: number
        totalPages: number
    }
    dormantPrivilegedAccounts: {
        items: User[]
        total: number
        page: number
        totalPages: number
    }
}

interface RegionalOversightOverview {
    visibleUsers: number
    institutions: Array<{
        institution: string
        totalUsers: number
        activeUsers: number
        admins: number
        invited: number
        passwordResetsPending: number
        adminDetails: Array<{ _id: string; name: string; email: string; status: string }>
    }>
    summary: {
        institutions: number
        institutionsMissingAdmin: number
        invitedUsers: number
        passwordResetsPending: number
    }
}

interface InstitutionTeamOverview {
    summary: {
        teamMembers: number
        managers: number
        guardians: number
        pendingInvites: number
        suspended: number
    }
    teamUsers: User[]
    workloadOwners: Array<User & { totalAssigned: number }>
    suspendCandidates: User[]
    reassignmentCandidates: User[]
}

export default function Users() {
    const GOVERNANCE_PAGE_SIZE = 6
    const [data, setData] = useState<User[]>([])
    const [tableData, setTableData] = useState<User[]>([])
    const [accessApprovalQueue, setAccessApprovalQueue] = useState<AccessApprovalQueueItem[]>([])
    const [loading, setLoading] = useState(true)
    const [tableLoading, setTableLoading] = useState(true)
    const [registryPage, setRegistryPage] = useState(1)
    const [registryPageSize] = useState(12)
    const [registryTotal, setRegistryTotal] = useState(0)
    const [registryTotalPages, setRegistryTotalPages] = useState(0)
    const [hqGovernanceOverview, setHqGovernanceOverview] = useState<HqGovernanceOverview | null>(null)
    const [regionalOversightOverview, setRegionalOversightOverview] = useState<RegionalOversightOverview | null>(null)
    const [institutionTeamOverview, setInstitutionTeamOverview] = useState<InstitutionTeamOverview | null>(null)
    const [open, setOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [sorting, setSorting] = useState<SortingState>([])
    const [deactivationImpact, setDeactivationImpact] = useState<DeactivationImpact | null>(null)
    const [blockedUser, setBlockedUser] = useState<User | null>(null)
    const [reassignmentOptions, setReassignmentOptions] = useState<ReassignmentOptions>({ ownerCandidates: [], supportAssignees: [], partnerSupervisors: [] })
    const [reassignmentLoading, setReassignmentLoading] = useState(false)
    const [reassignmentDrafts, setReassignmentDrafts] = useState<Record<string, string>>({})
    const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false)
    const [bulkSuspendSelection, setBulkSuspendSelection] = useState<string[]>([])
    const [bulkSuspendSubmitting, setBulkSuspendSubmitting] = useState(false)
    const [bulkSuspendResults, setBulkSuspendResults] = useState<BulkSuspendResult[]>([])
    const [reassignmentWorkspaceOpen, setReassignmentWorkspaceOpen] = useState(false)
    const [reassignmentWorkspaceUserId, setReassignmentWorkspaceUserId] = useState("")
    const [auditUser, setAuditUser] = useState<User | null>(null)
    const [escalationOpen, setEscalationOpen] = useState(false)
    const [escalationSubmitting, setEscalationSubmitting] = useState(false)
    const [escalationDraft, setEscalationDraft] = useState({
        subject: "Regional access governance escalation",
        description: "",
        requestType: "Other",
        priority: "Medium",
    })
    const [userFormPrefill, setUserFormPrefill] = useState<Record<string, unknown> | null>(null)
    const [approvalDecisionOpen, setApprovalDecisionOpen] = useState(false)
    const [selectedApproval, setSelectedApproval] = useState<AccessApprovalQueueItem | null>(null)
    const [approvalDecision, setApprovalDecision] = useState<"Approved" | "Rejected">("Approved")
    const [approvalComment, setApprovalComment] = useState("")
    const [approvalSubmitting, setApprovalSubmitting] = useState(false)
    const [implementationApprovalId, setImplementationApprovalId] = useState<string | null>(null)
    const [approvalQueuePage, setApprovalQueuePage] = useState(1)
    const [anomalyPage, setAnomalyPage] = useState(1)
    const [dormantPage, setDormantPage] = useState(1)
    const { authFetch, user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()

    const roleFilter = searchParams.get("role") || ""
    const statusFilter = searchParams.get("status") || ""
    const institutionFilter = searchParams.get("institution") || ""
    const regionFilter = searchParams.get("region") || ""
    const governanceFilter = searchParams.get("governance") || ""
    const createMode = searchParams.get("create") || ""
    const linkedLearnerId = searchParams.get("learnerId") || ""

    const clearTransientParams = () => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("create")
            next.delete("learnerId")
            return next
        })
    }

    const openPrefilledUserForm = (prefill: Record<string, unknown>) => {
        setEditingUser(null)
        setImplementationApprovalId(null)
        setUserFormPrefill(prefill)
        setOpen(true)
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                const shouldFetchFullUsers = Boolean(governanceFilter)
                const requests = shouldFetchFullUsers ? [authFetch('/api/users')] : []
                if (user?.role === "SuperAdmin") {
                    requests.push(authFetch('/api/access-approvals'))
                }

                const responses = await Promise.all(requests)
                if (shouldFetchFullUsers) {
                    const usersResponse = responses[0]
                    if (!usersResponse.ok) throw new Error("Failed to fetch")
                    const usersData = await usersResponse.json()
                    setData(usersData)
                } else {
                    setData([])
                }

                if (user?.role === "SuperAdmin") {
                    const queueResponse = responses[shouldFetchFullUsers ? 1 : 0]
                    const queuePayload = queueResponse.ok ? await queueResponse.json() : []
                    setAccessApprovalQueue(
                        Array.isArray(queuePayload) ? queuePayload : []
                    )
                } else {
                    setAccessApprovalQueue([])
                }
            } catch (err) {
                console.error(err)
                toast.error("Failed to load users")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [refreshKey, authFetch, user?.role, governanceFilter])

    useEffect(() => {
        if (user?.role !== "SuperAdmin" || governanceFilter) {
            setHqGovernanceOverview(null)
            return
        }

        const fetchHqGovernanceOverview = async () => {
            try {
                const params = new URLSearchParams()
                params.set("anomalyPage", String(anomalyPage))
                params.set("dormantPage", String(dormantPage))
                params.set("pageSize", String(GOVERNANCE_PAGE_SIZE))
                const res = await authFetch(`/api/users/governance/overview?${params.toString()}`)
                if (!res.ok) throw new Error("Failed to fetch governance overview")
                const payload = await res.json()
                setHqGovernanceOverview(payload)
            } catch (error) {
                console.error("Error fetching user governance overview:", error)
                toast.error("Failed to load governance overview")
            }
        }

        fetchHqGovernanceOverview()
    }, [authFetch, anomalyPage, dormantPage, governanceFilter, user?.role])

    useEffect(() => {
        if (user?.role !== "RegionalAdmin" || governanceFilter) {
            setRegionalOversightOverview(null)
            return
        }

        authFetch("/api/users/regional-oversight")
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to fetch regional oversight")
                return res.json()
            })
            .then(setRegionalOversightOverview)
            .catch((error) => {
                console.error("Error fetching regional oversight:", error)
                toast.error("Failed to load regional oversight")
            })
    }, [authFetch, governanceFilter, refreshKey, user?.role])

    useEffect(() => {
        if (user?.role !== "Admin" || governanceFilter) {
            setInstitutionTeamOverview(null)
            return
        }

        authFetch("/api/users/institution-team-overview")
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to fetch institution team overview")
                return res.json()
            })
            .then(setInstitutionTeamOverview)
            .catch((error) => {
                console.error("Error fetching institution team overview:", error)
                toast.error("Failed to load institution team overview")
            })
    }, [authFetch, governanceFilter, refreshKey, user?.role])

    useEffect(() => {
        if (governanceFilter) {
            setTableLoading(false)
            return
        }

        const fetchRegistry = async () => {
            setTableLoading(true)
            try {
                const params = new URLSearchParams()
                if (roleFilter) params.set("role", roleFilter)
                if (statusFilter) params.set("status", statusFilter)
                if (institutionFilter) params.set("institution", institutionFilter)
                if (regionFilter) params.set("region", regionFilter)
                params.set("page", String(registryPage))
                params.set("pageSize", String(registryPageSize))

                const res = await authFetch(`/api/users/registry?${params.toString()}`)
                if (!res.ok) throw new Error("Failed to fetch user registry")
                const payload = await res.json()
                setTableData(Array.isArray(payload.items) ? payload.items : [])
                setRegistryTotal(typeof payload.total === "number" ? payload.total : 0)
                setRegistryTotalPages(typeof payload.totalPages === "number" ? payload.totalPages : 0)
                setRegistryPage(typeof payload.page === "number" ? payload.page : 1)
            } catch (error) {
                console.error("Error fetching user registry:", error)
                toast.error("Failed to load user registry")
            } finally {
                setTableLoading(false)
            }
        }

        fetchRegistry()
    }, [authFetch, governanceFilter, institutionFilter, refreshKey, regionFilter, registryPage, registryPageSize, roleFilter, statusFilter])

    useEffect(() => {
        if (createMode !== "guardian" || !linkedLearnerId || open || editingUser) return

        openPrefilledUserForm({
            role: "Guardian",
            status: "Active",
            linkedLearners: [linkedLearnerId],
        })
        clearTransientParams()
    }, [createMode, linkedLearnerId, open, editingUser])

    const handleSuccess = async (savedUser: unknown) => {
        if (implementationApprovalId && savedUser && typeof savedUser === "object" && "_id" in savedUser) {
            try {
                const res = await authFetch(`/api/access-approvals/${implementationApprovalId}/implement`, {
                    method: "PUT",
                    body: JSON.stringify({ implementedUserId: (savedUser as { _id: string })._id }),
                })
                const payload = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(payload.message || "Failed to mark approval as implemented")
                toast.success("Approved access request implemented")
            } catch (error) {
                console.error("Error marking approval as implemented:", error)
                toast.error(error instanceof Error ? error.message : "Saved user, but failed to mark approval as implemented")
            }
        }

        setOpen(false)
        setEditingUser(null)
        setUserFormPrefill(null)
        setImplementationApprovalId(null)
        setRefreshKey(prev => prev + 1)
        toast.success(editingUser ? "User updated successfully" : "User created successfully")
    }
    
    const handleEdit = (user: User) => {
        setUserFormPrefill(null)
        setImplementationApprovalId(null)
        setEditingUser(user)
        setOpen(true)
    }
    
    const handleToggleStatus = async (user: User) => {
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active'
        try {
            const res = await authFetch(`/api/users/${user._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (res.status === 409) {
                    setDeactivationImpact(payload as DeactivationImpact)
                    setBlockedUser(user)
                    return
                }
                throw new Error(payload.message || "Failed to update status")
            }
            setRefreshKey(prev => prev + 1)
            toast.success(`User marked as ${newStatus}`)
        } catch (error) {
            console.error("Error toggling status:", error)
            toast.error("Failed to update user status")
        }
    }

    const loadReassignmentOptions = async (targetUser: User) => {
        setReassignmentLoading(true)
        try {
            const res = await authFetch(`/api/users/${targetUser._id}/reassignment-options`)
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to load reassignment options")
            setReassignmentOptions({
                ownerCandidates: payload.ownerCandidates || [],
                supportAssignees: payload.supportAssignees || [],
                partnerSupervisors: payload.partnerSupervisors || [],
            })
        } catch (error) {
            console.error("Error fetching reassignment options:", error)
            toast.error(error instanceof Error ? error.message : "Failed to load reassignment options")
        } finally {
            setReassignmentLoading(false)
        }
    }

    const loadDeactivationImpact = async (targetUser: User) => {
        const res = await authFetch(`/api/users/${targetUser._id}/deactivation-impact`)
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload.message || "Failed to load reassignment workload")
        setDeactivationImpact(payload as DeactivationImpact)
        return payload as DeactivationImpact
    }

    useEffect(() => {
        if (deactivationImpact && blockedUser) {
            loadReassignmentOptions(blockedUser)
        } else {
            setReassignmentOptions({ ownerCandidates: [], supportAssignees: [], partnerSupervisors: [] })
            setReassignmentDrafts({})
        }
    }, [deactivationImpact, blockedUser])

    const refreshBlockedUserState = async () => {
        if (!blockedUser) return
        setDeactivationImpact(null)
        await handleToggleStatus(blockedUser)
    }

    const openReassignmentWorkspace = async (targetUser: User) => {
        setBlockedUser(targetUser)
        setReassignmentWorkspaceUserId(targetUser._id)
        setReassignmentWorkspaceOpen(true)
        setReassignmentLoading(true)
        try {
            await Promise.all([
                loadDeactivationImpact(targetUser),
                loadReassignmentOptions(targetUser),
            ])
        } catch (error) {
            console.error("Error opening reassignment workspace:", error)
            toast.error(error instanceof Error ? error.message : "Failed to load reassignment workspace")
        } finally {
            setReassignmentLoading(false)
        }
    }

    const handleReassign = async (kind: "learner" | "placement" | "partnerPlacement" | "supportAssignment" | "supportEscalation", itemId: string) => {
        const selectedId = reassignmentDrafts[`${kind}:${itemId}`]
        if (!selectedId) {
            toast.error("Select a replacement user first")
            return
        }

        try {
            let res: Response
            if (kind === "learner") {
                res = await authFetch(`/api/learners/${itemId}/owner`, { method: "PUT", body: JSON.stringify({ ownerId: selectedId }) })
            } else if (kind === "placement") {
                res = await authFetch(`/api/placements/${itemId}/owner`, { method: "PUT", body: JSON.stringify({ ownerId: selectedId }) })
            } else if (kind === "partnerPlacement") {
                res = await authFetch(`/api/placements/${itemId}/partner-supervisor`, { method: "PUT", body: JSON.stringify({ supervisorId: selectedId }) })
            } else if (kind === "supportAssignment") {
                res = await authFetch(`/api/support-tickets/${itemId}/assignment`, { method: "PUT", body: JSON.stringify({ assignedTo: selectedId }) })
            } else {
                res = await authFetch(`/api/support-tickets/${itemId}/escalation`, { method: "PUT", body: JSON.stringify({ escalatedTo: selectedId, escalationLevel: "HQ", escalationReason: "Reassigned during user deactivation workflow" }) })
            }

            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to reassign item")
            toast.success("Assignment updated")
            if (reassignmentWorkspaceOpen && blockedUser) {
                await Promise.all([
                    loadDeactivationImpact(blockedUser),
                    loadReassignmentOptions(blockedUser),
                ])
                setRefreshKey((prev) => prev + 1)
            } else {
                await refreshBlockedUserState()
            }
        } catch (error) {
            console.error("Error reassigning item:", error)
            toast.error(error instanceof Error ? error.message : "Failed to reassign item")
        }
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this user?")) {
            try {
                const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error("Failed to delete")
                setRefreshKey(prev => prev + 1)
                toast.success("User deleted successfully")
            } catch (error) {
                console.error("Error deleting user:", error)
                toast.error("Failed to delete user")
            }
        }
    }

    const handleSendSetupLink = async (targetUser: User) => {
        try {
            const res = await authFetch(`/api/users/${targetUser._id}/send-setup-link`, { method: "POST" })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to send setup link")
            setRefreshKey((prev) => prev + 1)
            toast.success(`Setup/reset link sent to ${targetUser.email}`)
        } catch (error) {
            console.error("Error sending setup link:", error)
            toast.error(error instanceof Error ? error.message : "Failed to send setup link")
        }
    }

    const filteredData = useMemo(() => {
        return data.filter((user) => {
            if (roleFilter && user.role !== roleFilter) return false
            if (statusFilter && user.status !== statusFilter) return false
            if (institutionFilter && user.institution !== institutionFilter) return false
            if (regionFilter && user.effectiveRegion !== regionFilter) return false

            if (governanceFilter === "orphaned-institutions") {
                return user.role === "Admin" && user.status === "Active"
            }

            if (governanceFilter === "privileged-anomalies") {
                return user.role === "Admin" || user.role === "Manager"
            }

            if (governanceFilter === "password-reset-pending") {
                return user.passwordChangeRequired === true
            }

            if (governanceFilter === "risky-accounts") {
                return (user.auditSummary?.failedLoginCount ?? 0) >= 5
                    || (["SuperAdmin", "RegionalAdmin", "Admin"].includes(user.role) && user.status === "Inactive")
                    || Boolean(user.auditSummary?.recentSensitiveActions?.length)
            }

            if (governanceFilter === "dormant-privileged") {
                if (!["SuperAdmin", "RegionalAdmin", "Admin"].includes(user.role) || user.status !== "Active") return false
                if (!user.lastLoginAt) return true
                return (Date.now() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24) >= 45
            }

            if (governanceFilter === "owned-workload") {
                return ((user.workloadSummary?.learnersOwned ?? 0) + (user.workloadSummary?.activePlacementsOwned ?? 0)) > 0
            }

            return true
        })
    }, [data, roleFilter, statusFilter, institutionFilter, regionFilter, governanceFilter])

    const activeFilters = [
        roleFilter ? `Role: ${roleFilter}` : "",
        statusFilter ? `Status: ${statusFilter}` : "",
        institutionFilter ? `Institution: ${institutionFilter}` : "",
        regionFilter ? `Region: ${regionFilter}` : "",
        governanceFilter === "orphaned-institutions" ? "View: Active admins" : "",
        governanceFilter === "privileged-anomalies" ? "View: Privileged users" : "",
        governanceFilter === "password-reset-pending" ? "View: Password reset pending" : "",
        governanceFilter === "risky-accounts" ? "View: Risky accounts" : "",
        governanceFilter === "dormant-privileged" ? "View: Dormant privileged accounts" : "",
        governanceFilter === "pending-approvals" ? "View: Pending approvals" : "",
        governanceFilter === "approved-awaiting-implementation" ? "View: Approved awaiting implementation" : "",
        governanceFilter === "rejected-approvals" ? "View: Rejected approvals" : "",
        governanceFilter === "implemented-approvals" ? "View: Implemented approvals" : "",
        governanceFilter === "owned-workload" ? "View: Staff with assigned work" : "",
    ].filter(Boolean)

    useEffect(() => {
        setRegistryPage(1)
    }, [roleFilter, statusFilter, institutionFilter, regionFilter, governanceFilter])

    const clearFilters = () => setSearchParams({})

    const regionalInstitutionStats = useMemo(() => {
        if (user?.role !== "RegionalAdmin") return []

        const grouped = new Map<string, {
            institution: string
            totalUsers: number
            activeUsers: number
            admins: number
            invited: number
            passwordResetsPending: number
            adminDetails: Array<{ _id: string; name: string; email: string; status: string }>
        }>()

        data.forEach((entry) => {
            const institution = entry.institution || "Unassigned"
            const current = grouped.get(institution) || {
                institution,
                totalUsers: 0,
                activeUsers: 0,
                admins: 0,
                invited: 0,
                passwordResetsPending: 0,
                adminDetails: [],
            }

            current.totalUsers += 1
            if (entry.status === "Active") current.activeUsers += 1
            if (entry.role === "Admin") {
                if (entry.status === "Active") current.admins += 1
                current.adminDetails.push({
                    _id: entry._id,
                    name: entry.name,
                    email: entry.email,
                    status: entry.status,
                })
            }
            if (entry.lifecycleStatus?.code === "Invited") current.invited += 1
            if (entry.lifecycleStatus?.code === "ResetPending" || entry.lifecycleStatus?.code === "PasswordChangeRequired") {
                current.passwordResetsPending += 1
            }

            grouped.set(institution, current)
        })

        return Array.from(grouped.values()).sort((a, b) => a.institution.localeCompare(b.institution))
    }, [data, user?.role])

    const regionalOversightStats = useMemo(() => {
        if (user?.role !== "RegionalAdmin") return null

        return {
            institutions: regionalInstitutionStats.length,
            institutionsMissingAdmin: regionalInstitutionStats.filter((entry) => entry.admins === 0).length,
            invitedUsers: regionalInstitutionStats.reduce((sum, entry) => sum + entry.invited, 0),
            passwordResetsPending: regionalInstitutionStats.reduce((sum, entry) => sum + entry.passwordResetsPending, 0),
        }
    }, [regionalInstitutionStats, user?.role])

    const openInstitutionFilter = (institution: string, governance?: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("institution", institution)
            if (governance) {
                next.set("governance", governance)
            } else {
                next.delete("governance")
            }
            return next
        })
    }

    const openEscalationForInstitution = (institution: string, reason: string) => {
        setEscalationDraft({
            subject: `Regional access escalation: ${institution}`,
            description: `Institution: ${institution}\nReason: ${reason}\nRequested HQ action:\n- `,
            requestType: "OutOfScopeChange",
            priority: "High",
        })
        setEscalationOpen(true)
    }

    const canManageUser = (target: User) => {
        if (user?.role === "SuperAdmin") return true
        if (user?.role === "RegionalAdmin") return ["Admin", "Manager", "Staff", "Guardian"].includes(target.role)
        return ["Manager", "Staff", "Guardian"].includes(target.role)
    }

    const hqRegionOptions = useMemo(() => {
        if (user?.role !== "SuperAdmin") return []
        if (hqGovernanceOverview) {
            return hqGovernanceOverview.regionStats
                .map((entry) => entry.region)
                .filter((region) => Boolean(region) && region !== "Unassigned")
                .sort()
        }
        return [...new Set(data.map((entry) => entry.effectiveRegion).filter((region): region is string => Boolean(region)))].sort()
    }, [data, hqGovernanceOverview, user?.role])

    const hqRoleGovernance = useMemo(() => {
        if (user?.role !== "SuperAdmin") return null

        const roleCounts = data.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.role] = (acc[entry.role] || 0) + 1
            return acc
        }, {})

        const riskyAccounts = data.filter((entry) =>
            (entry.auditSummary?.failedLoginCount ?? 0) >= 5
            || (["SuperAdmin", "RegionalAdmin", "Admin"].includes(entry.role) && entry.status === "Inactive")
            || (entry.auditSummary?.recentSensitiveActions?.length ?? 0) >= 3
        )

        const dormantPrivilegedAccounts = data
            .filter((entry) => ["SuperAdmin", "RegionalAdmin", "Admin"].includes(entry.role) && entry.status === "Active")
            .filter((entry) => {
                if (!entry.lastLoginAt) return true
                return (Date.now() - new Date(entry.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24) >= 45
            })
            .sort((a, b) => {
                const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0
                const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0
                return aTime - bTime
            })

        const regionStats = Object.values(data.reduce<Record<string, {
            region: string
            totalUsers: number
            privilegedUsers: number
            invitedUsers: number
        }>>((acc, entry) => {
            const region = entry.effectiveRegion || "Unassigned"
            if (!acc[region]) {
                acc[region] = { region, totalUsers: 0, privilegedUsers: 0, invitedUsers: 0 }
            }
            acc[region].totalUsers += 1
            if (["SuperAdmin", "RegionalAdmin", "Admin"].includes(entry.role)) acc[region].privilegedUsers += 1
            if (entry.lifecycleStatus?.code === "Invited") acc[region].invitedUsers += 1
            return acc
        }, {})).sort((a, b) => b.totalUsers - a.totalUsers)

        return {
            roleCounts,
            riskyAccounts,
            dormantPrivilegedAccounts,
            regionStats,
        }
    }, [data, user?.role])

    const accessApprovalViews = useMemo(() => {
        const pending = accessApprovalQueue.filter((item) => item.status === "Pending")
        const approvedAwaitingImplementation = accessApprovalQueue.filter((item) => item.status === "Approved" && !item.implementedAt)
        const rejected = accessApprovalQueue.filter((item) => item.status === "Rejected")
        const implemented = accessApprovalQueue.filter((item) => item.status === "Approved" && Boolean(item.implementedAt))

        return {
            pending,
            approvedAwaitingImplementation,
            rejected,
            implemented,
        }
    }, [accessApprovalQueue])

    const selectedApprovalHistory = useMemo(() => {
        if (governanceFilter === "pending-approvals") return accessApprovalViews.pending
        if (governanceFilter === "approved-awaiting-implementation") return accessApprovalViews.approvedAwaitingImplementation
        if (governanceFilter === "rejected-approvals") return accessApprovalViews.rejected
        if (governanceFilter === "implemented-approvals") return accessApprovalViews.implemented
        return []
    }, [accessApprovalViews, governanceFilter])

    const approvalQueueItems = useMemo(() => {
        return governanceFilter
            ? selectedApprovalHistory
            : [...accessApprovalViews.pending, ...accessApprovalViews.approvedAwaitingImplementation]
    }, [accessApprovalViews.approvedAwaitingImplementation, accessApprovalViews.pending, governanceFilter, selectedApprovalHistory])

    const paginatedApprovalQueueItems = useMemo(() => {
        const start = (approvalQueuePage - 1) * GOVERNANCE_PAGE_SIZE
        return approvalQueueItems.slice(start, start + GOVERNANCE_PAGE_SIZE)
    }, [GOVERNANCE_PAGE_SIZE, approvalQueueItems, approvalQueuePage])

    const paginatedAnomalyItems = useMemo(() => {
        const start = (anomalyPage - 1) * GOVERNANCE_PAGE_SIZE
        return hqRoleGovernance?.riskyAccounts.slice(start, start + GOVERNANCE_PAGE_SIZE) || []
    }, [GOVERNANCE_PAGE_SIZE, anomalyPage, hqRoleGovernance?.riskyAccounts])

    const paginatedDormantItems = useMemo(() => {
        const start = (dormantPage - 1) * GOVERNANCE_PAGE_SIZE
        return hqRoleGovernance?.dormantPrivilegedAccounts.slice(start, start + GOVERNANCE_PAGE_SIZE) || []
    }, [GOVERNANCE_PAGE_SIZE, dormantPage, hqRoleGovernance?.dormantPrivilegedAccounts])

    useEffect(() => {
        setApprovalQueuePage(1)
    }, [governanceFilter])

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(approvalQueueItems.length / GOVERNANCE_PAGE_SIZE))
        if (approvalQueuePage > maxPage) setApprovalQueuePage(maxPage)
    }, [GOVERNANCE_PAGE_SIZE, approvalQueueItems.length, approvalQueuePage])

    useEffect(() => {
        const riskyCount = hqGovernanceOverview?.riskyAccounts.total ?? hqRoleGovernance?.riskyAccounts.length ?? 0
        const maxPage = Math.max(1, Math.ceil(riskyCount / GOVERNANCE_PAGE_SIZE))
        if (anomalyPage > maxPage) setAnomalyPage(maxPage)
    }, [GOVERNANCE_PAGE_SIZE, anomalyPage, hqGovernanceOverview?.riskyAccounts.total, hqRoleGovernance?.riskyAccounts.length])

    useEffect(() => {
        const dormantCount = hqGovernanceOverview?.dormantPrivilegedAccounts.total ?? hqRoleGovernance?.dormantPrivilegedAccounts.length ?? 0
        const maxPage = Math.max(1, Math.ceil(dormantCount / GOVERNANCE_PAGE_SIZE))
        if (dormantPage > maxPage) setDormantPage(maxPage)
    }, [GOVERNANCE_PAGE_SIZE, dormantPage, hqGovernanceOverview?.dormantPrivilegedAccounts.total, hqRoleGovernance?.dormantPrivilegedAccounts.length])

    const institutionTeamStats = useMemo(() => {
        if (user?.role !== "Admin") return null

        const teamUsers = data.filter((entry) => ["Admin", "Manager", "Staff", "Guardian"].includes(entry.role))
        const managers = teamUsers.filter((entry) => entry.role === "Manager")
        const staff = teamUsers.filter((entry) => entry.role === "Staff")
        const guardians = teamUsers.filter((entry) => entry.role === "Guardian")
        const pendingInvites = teamUsers.filter((entry) => ["Invited", "ResetPending", "PasswordChangeRequired"].includes(entry.lifecycleStatus?.code || ""))
        const suspended = teamUsers.filter((entry) => entry.status === "Inactive")
        const workloadOwners = teamUsers
            .filter((entry) => entry.role !== "Admin" && entry.role !== "Guardian")
            .map((entry) => ({
                ...entry,
                totalAssigned: (entry.workloadSummary?.learnersOwned ?? 0) + (entry.workloadSummary?.activePlacementsOwned ?? 0),
            }))
            .sort((a, b) => b.totalAssigned - a.totalAssigned)

        return {
            teamUsers,
            managers,
            staff,
            guardians,
            pendingInvites,
            suspended,
            workloadOwners,
        }
    }, [data, user?.role])

    const institutionSuspendCandidates = useMemo(() => {
        if (institutionTeamOverview && !governanceFilter) return institutionTeamOverview.suspendCandidates.filter((entry) => canManageUser(entry))
        if (!institutionTeamStats) return []
        return institutionTeamStats.teamUsers.filter((entry) => entry.status === "Active" && canManageUser(entry))
    }, [governanceFilter, institutionTeamOverview, institutionTeamStats, user?.role])

    const institutionReassignmentCandidates = useMemo(() => {
        if (institutionTeamOverview && !governanceFilter) return institutionTeamOverview.reassignmentCandidates.filter((entry) => canManageUser(entry))
        if (!institutionTeamStats) return []
        return institutionTeamStats.teamUsers
            .filter((entry) => canManageUser(entry))
            .filter((entry) =>
                entry.role !== "Guardian"
                && (
                    (entry.workloadSummary?.learnersOwned ?? 0) > 0
                    || (entry.workloadSummary?.activePlacementsOwned ?? 0) > 0
                    || entry.role === "Manager"
                    || entry.role === "Staff"
                )
            )
            .sort((a, b) => {
                const aAssignments = (a.workloadSummary?.learnersOwned ?? 0) + (a.workloadSummary?.activePlacementsOwned ?? 0)
                const bAssignments = (b.workloadSummary?.learnersOwned ?? 0) + (b.workloadSummary?.activePlacementsOwned ?? 0)
                return bAssignments - aAssignments || a.name.localeCompare(b.name)
            })
    }, [governanceFilter, institutionTeamOverview, institutionTeamStats, user?.role])

    const currentReassignmentTarget = blockedUser

    const getBlockerCount = (impact?: DeactivationImpact | null) => {
        if (!impact) return 0
        return (
            impact.blockers.learnersOwned.length
            + impact.blockers.activePlacementsOwned.length
            + impact.blockers.partnerPlacementsAssigned.length
            + impact.blockers.supportAssignments.length
            + impact.blockers.supportEscalations.length
        )
    }

    const handleWorkspaceUserChange = async (userId: string) => {
        setReassignmentWorkspaceUserId(userId)
        const teamLookup = institutionTeamOverview?.teamUsers || data
        const targetUser = institutionReassignmentCandidates.find((entry) => entry._id === userId) || teamLookup.find((entry) => entry._id === userId) || null
        if (!targetUser) return
        await openReassignmentWorkspace(targetUser)
    }

    const handleBulkSuspend = async () => {
        if (!bulkSuspendSelection.length) {
            toast.error("Select at least one account to suspend")
            return
        }

        setBulkSuspendSubmitting(true)
        const results: BulkSuspendResult[] = []

        for (const userId of bulkSuspendSelection) {
            const targetUser = institutionSuspendCandidates.find((entry) => entry._id === userId)
            if (!targetUser) continue

            try {
                const res = await authFetch(`/api/users/${targetUser._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Inactive' })
                })
                const payload = await res.json().catch(() => ({}))
                if (res.ok) {
                    results.push({
                        userId: targetUser._id,
                        userName: targetUser.name,
                        status: "suspended",
                        message: "Account suspended",
                    })
                    continue
                }

                if (res.status === 409) {
                    const impact = payload as DeactivationImpact
                    results.push({
                        userId: targetUser._id,
                        userName: targetUser.name,
                        status: "blocked",
                        message: impact.message || "Work must be reassigned before suspension",
                        blockers: impact.blockers,
                    })
                    continue
                }

                throw new Error(payload.message || "Failed to suspend account")
            } catch (error) {
                results.push({
                    userId: targetUser._id,
                    userName: targetUser.name,
                    status: "failed",
                    message: error instanceof Error ? error.message : "Failed to suspend account",
                })
            }
        }

        setBulkSuspendResults(results)
        setBulkSuspendSelection(results.filter((result) => result.status !== "suspended").map((result) => result.userId))
        setBulkSuspendSubmitting(false)
        setRefreshKey((prev) => prev + 1)
        toast.success("Bulk suspension run completed")
    }

    const handleEscalateToHQ = async () => {
        setEscalationSubmitting(true)
        try {
            const res = await authFetch("/api/access-approvals", {
                method: "POST",
                body: JSON.stringify({
                    subject: escalationDraft.subject,
                    priority: escalationDraft.priority,
                    description: escalationDraft.description,
                    requestType: escalationDraft.requestType,
                    requestedInstitution: institutionFilter || undefined,
                }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to submit escalation")
            toast.success("Approval request submitted to HQ")
            setEscalationOpen(false)
            setEscalationDraft({
                subject: "Regional access governance escalation",
                description: "",
                requestType: "Other",
                priority: "Medium",
            })
        } catch (error) {
            console.error("Error submitting escalation:", error)
            toast.error(error instanceof Error ? error.message : "Failed to submit escalation")
        } finally {
            setEscalationSubmitting(false)
        }
    }

    const handleDecideApproval = async () => {
        if (!selectedApproval) return
        setApprovalSubmitting(true)
        try {
            const res = await authFetch(`/api/access-approvals/${selectedApproval._id}/decision`, {
                method: "PUT",
                body: JSON.stringify({
                    decision: approvalDecision,
                    comment: approvalComment,
                }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload.message || "Failed to update approval")
            toast.success(`Approval request ${approvalDecision.toLowerCase()}`)
            setApprovalDecisionOpen(false)
            const approvalToApply = selectedApproval
            setSelectedApproval(null)
            setApprovalComment("")
            setRefreshKey((prev) => prev + 1)
            if (approvalDecision === "Approved") {
                if (approvalToApply.targetUser?._id) {
                    setUserFormPrefill({
                        _id: approvalToApply.targetUser._id,
                        name: approvalToApply.targetUser.name || "",
                        email: approvalToApply.targetUser.email || "",
                        role: approvalToApply.requestedRole || approvalToApply.targetUser.role || "Staff",
                        status: "Active",
                        phone: "",
                        institution: approvalToApply.requestedInstitution || approvalToApply.targetUser.institution || "",
                        region: approvalToApply.requestedRegion || approvalToApply.targetUser.region || "",
                        partnerId: "",
                    })
                    setImplementationApprovalId(approvalToApply._id)
                    setEditingUser({
                        _id: approvalToApply.targetUser._id,
                        name: approvalToApply.targetUser.name || "",
                        email: approvalToApply.targetUser.email || "",
                        role: approvalToApply.requestedRole || approvalToApply.targetUser.role || "Staff",
                        status: "Active",
                        institution: approvalToApply.requestedInstitution || approvalToApply.targetUser.institution || "",
                        region: approvalToApply.requestedRegion || approvalToApply.targetUser.region || "",
                        createdAt: new Date().toISOString(),
                    } as User)
                } else {
                    setEditingUser(null)
                    setUserFormPrefill({
                        name: "",
                        email: "",
                        role: approvalToApply.requestedRole || "Staff",
                        status: "Active",
                        phone: "",
                        institution: approvalToApply.requestedInstitution || "",
                        region: approvalToApply.requestedRegion || "",
                        partnerId: "",
                    })
                    setImplementationApprovalId(approvalToApply._id)
                }
                setOpen(true)
            }
        } catch (error) {
            console.error("Error deciding approval:", error)
            toast.error(error instanceof Error ? error.message : "Failed to update approval")
        } finally {
            setApprovalSubmitting(false)
        }
    }

    return (
        <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
             <Dialog open={escalationOpen} onOpenChange={setEscalationOpen}>
                <DialogContent className="sm:max-w-[640px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                    <DialogHeader>
                        <DialogTitle className="text-gray-900">Escalate Out-of-Scope Change to HQ</DialogTitle>
                        <DialogDescription className="text-gray-600">
                            Use this when the requested access change is outside regional governance, such as cross-region access or privileged role requests.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-2">Subject</p>
                            <input
                                value={escalationDraft.subject}
                                onChange={(e) => setEscalationDraft((current) => ({ ...current, subject: e.target.value }))}
                                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-2">Request Type</p>
                            <Select value={escalationDraft.requestType} onValueChange={(value) => setEscalationDraft((current) => ({ ...current, requestType: value }))}>
                                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Request type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="OutOfScopeChange">Out-of-scope change</SelectItem>
                                    <SelectItem value="PrivilegedRoleAssignment">Privileged role assignment</SelectItem>
                                    <SelectItem value="CrossRegionAccess">Cross-region access</SelectItem>
                                    <SelectItem value="AccountRecovery">Account recovery</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-2">Priority</p>
                            <Select value={escalationDraft.priority} onValueChange={(value) => setEscalationDraft((current) => ({ ...current, priority: value }))}>
                                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Priority" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Low">Low</SelectItem>
                                    <SelectItem value="Medium">Medium</SelectItem>
                                    <SelectItem value="High">High</SelectItem>
                                    <SelectItem value="Urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-2">What needs HQ action?</p>
                            <Textarea
                                value={escalationDraft.description}
                                onChange={(e) => setEscalationDraft((current) => ({ ...current, description: e.target.value }))}
                                placeholder="Describe the requested user/access change, affected institution or account, and why it is outside regional authority."
                                className="min-h-[140px]"
                            />
                        </div>
                        <Button
                            onClick={handleEscalateToHQ}
                            disabled={escalationSubmitting || !escalationDraft.description.trim()}
                            className="w-full rounded-2xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"
                        >
                            {escalationSubmitting ? "Submitting..." : "Submit Escalation"}
                        </Button>
                    </div>
                </DialogContent>
             </Dialog>
             <Dialog open={approvalDecisionOpen} onOpenChange={setApprovalDecisionOpen}>
                <DialogContent className="sm:max-w-[640px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                    <DialogHeader>
                        <DialogTitle className="text-gray-900">Decide Access Approval</DialogTitle>
                        <DialogDescription className="text-gray-600">
                            Record the HQ decision for this governance request.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedApproval ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <p className="font-bold text-gray-900">{selectedApproval.subject}</p>
                                <p className="text-sm text-gray-600 mt-2">{selectedApproval.description}</p>
                                <p className="text-xs text-gray-500 mt-3">
                                    {selectedApproval.requester?.name || "Unknown requester"} · {selectedApproval.requester?.role || "Unknown role"} · {selectedApproval.institution || selectedApproval.region || "Platform"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900 mb-2">Decision</p>
                                <Select value={approvalDecision} onValueChange={(value: "Approved" | "Rejected") => setApprovalDecision(value)}>
                                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Decision" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Approved">Approve</SelectItem>
                                        <SelectItem value="Rejected">Reject</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900 mb-2">Decision Note</p>
                                <Textarea
                                    value={approvalComment}
                                    onChange={(e) => setApprovalComment(e.target.value)}
                                    placeholder="Add approval conditions, rejection reason, or next steps for the requester."
                                    className="min-h-[120px]"
                                />
                            </div>
                            <Button onClick={handleDecideApproval} disabled={approvalSubmitting} className="w-full rounded-2xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900">
                                {approvalSubmitting ? "Saving..." : approvalDecision === "Approved" ? "Approve Request" : "Reject Request"}
                            </Button>
                        </div>
                    ) : null}
                </DialogContent>
             </Dialog>
             <Dialog open={Boolean(auditUser)} onOpenChange={(open) => { if (!open) setAuditUser(null) }}>
                <DialogContent className="sm:max-w-[760px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                    <DialogHeader>
                        <DialogTitle className="text-gray-900">User Audit Visibility</DialogTitle>
                        <DialogDescription className="text-gray-600">
                            Review account provenance, access changes, authentication failures, and recent sensitive actions.
                        </DialogDescription>
                    </DialogHeader>
                    {auditUser ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Created By</p>
                                    <p className="mt-2 font-bold text-gray-900">
                                        {auditUser.auditSummary?.createdBy ? `${auditUser.auditSummary.createdBy.actorName} (${auditUser.auditSummary.createdBy.actorRole})` : "Not recorded"}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {auditUser.auditSummary?.createdBy?.createdAt ? new Date(auditUser.auditSummary.createdBy.createdAt).toLocaleString() : "No creation audit timestamp"}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Last Role Change</p>
                                    <p className="mt-2 font-bold text-gray-900">
                                        {auditUser.auditSummary?.lastRoleChange ? `${auditUser.auditSummary.lastRoleChange.actorName} (${auditUser.auditSummary.lastRoleChange.actorRole})` : "No role change recorded"}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {auditUser.auditSummary?.lastRoleChange?.createdAt ? new Date(auditUser.auditSummary.lastRoleChange.createdAt).toLocaleString() : "No role change timestamp"}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Last Login</p>
                                    <p className="mt-2 font-bold text-gray-900">
                                        {auditUser.auditSummary?.lastLoginAt ? new Date(auditUser.auditSummary.lastLoginAt).toLocaleString() : "No successful login yet"}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-black uppercase tracking-wider text-gray-400">Failed Login Count</p>
                                    <p className="mt-2 text-2xl font-black text-gray-900">{auditUser.auditSummary?.failedLoginCount ?? 0}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                <p className="text-sm font-black text-gray-900">Recent Sensitive Actions</p>
                                {auditUser.auditSummary?.recentSensitiveActions?.length ? (
                                    auditUser.auditSummary.recentSensitiveActions.map((action) => (
                                        <div key={action._id} className="rounded-xl border border-gray-200 bg-white p-3">
                                            <p className="text-sm font-bold text-gray-900">{action.summary}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {action.actorName} ({action.actorRole}) · {new Date(action.createdAt).toLocaleString()}
                                            </p>
                                            {action.changedFields.length > 0 ? (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {action.changedFields.map((field) => (
                                                        <span key={field} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600">
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500">No recent sensitive actions recorded for this account.</p>
                                )}
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
             </Dialog>
             <Dialog open={bulkSuspendOpen} onOpenChange={(open) => {
                setBulkSuspendOpen(open)
                if (!open) {
                    setBulkSuspendSelection([])
                    setBulkSuspendResults([])
                }
             }}>
                <DialogContent className="sm:max-w-[840px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                    <DialogHeader>
                        <DialogTitle>Bulk Suspend Access</DialogTitle>
                        <DialogDescription>
                            Select active institution users to suspend. Accounts with active ownership will stay blocked until work is reassigned.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {institutionSuspendCandidates.length ? (
                            <div className="space-y-3">
                                {institutionSuspendCandidates.map((entry) => {
                                    const isSelected = bulkSuspendSelection.includes(entry._id)
                                    const totalAssigned = (entry.workloadSummary?.learnersOwned ?? 0) + (entry.workloadSummary?.activePlacementsOwned ?? 0)
                                    return (
                                        <button
                                            key={entry._id}
                                            type="button"
                                            onClick={() => setBulkSuspendSelection((current) => (
                                                current.includes(entry._id)
                                                    ? current.filter((id) => id !== entry._id)
                                                    : [...current, entry._id]
                                            ))}
                                            className={`w-full rounded-2xl border p-4 text-left transition ${isSelected ? "border-rose-300 bg-rose-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-gray-900">{entry.name}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{entry.role} · {entry.email}</p>
                                                </div>
                                                <Badge className={isSelected ? "bg-rose-600 text-white border-0" : "bg-white text-gray-700 border-gray-200"}>
                                                    {isSelected ? "Selected" : "Select"}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.workloadSummary?.learnersOwned ?? 0} learners</Badge>
                                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{entry.workloadSummary?.activePlacementsOwned ?? 0} placements</Badge>
                                                <Badge className="bg-slate-100 text-slate-700 border-slate-200">{totalAssigned} total assignments</Badge>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                No active institution users are available for bulk suspension.
                            </div>
                        )}

                        <Button
                            onClick={handleBulkSuspend}
                            disabled={bulkSuspendSubmitting || !bulkSuspendSelection.length}
                            className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 text-white"
                        >
                            {bulkSuspendSubmitting ? "Suspending selected accounts..." : `Suspend ${bulkSuspendSelection.length || 0} Selected Account${bulkSuspendSelection.length === 1 ? "" : "s"}`}
                        </Button>

                        {bulkSuspendResults.length ? (
                            <div className="space-y-3">
                                <p className="text-sm font-black text-gray-900">Run Results</p>
                                {bulkSuspendResults.map((result) => (
                                    <div key={result.userId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-gray-900">{result.userName}</p>
                                                <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge className={
                                                    result.status === "suspended"
                                                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                                        : result.status === "blocked"
                                                            ? "bg-amber-100 text-amber-700 border-amber-200"
                                                            : "bg-rose-100 text-rose-700 border-rose-200"
                                                }>
                                                    {result.status === "suspended" ? "Suspended" : result.status === "blocked" ? "Blocked" : "Failed"}
                                                </Badge>
                                                {result.status === "blocked" ? (
                                                    <Button
                                                        variant="outline"
                                                        className="rounded-xl"
                                                        onClick={() => {
                                                            const targetUser = institutionSuspendCandidates.find((entry) => entry._id === result.userId)
                                                                || institutionTeamOverview?.teamUsers.find((entry) => entry._id === result.userId)
                                                                || data.find((entry) => entry._id === result.userId)
                                                            if (!targetUser) return
                                                            setBulkSuspendOpen(false)
                                                            setBulkSuspendSelection([])
                                                            openReassignmentWorkspace(targetUser)
                                                        }}
                                                    >
                                                        Open Reassignment
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                        {result.blockers ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Badge className="bg-white text-gray-700 border-gray-200">{result.blockers.learnersOwned.length} learner owners</Badge>
                                                <Badge className="bg-white text-gray-700 border-gray-200">{result.blockers.activePlacementsOwned.length} placement owners</Badge>
                                                <Badge className="bg-white text-gray-700 border-gray-200">{result.blockers.supportAssignments.length + result.blockers.supportEscalations.length} support items</Badge>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
             </Dialog>
             <Dialog open={reassignmentWorkspaceOpen} onOpenChange={(open) => {
                setReassignmentWorkspaceOpen(open)
                if (!open) {
                    setReassignmentWorkspaceUserId("")
                    setBlockedUser(null)
                    setDeactivationImpact(null)
                    setReassignmentDrafts({})
                }
             }}>
                <DialogContent className="sm:max-w-[840px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                    <DialogHeader>
                        <DialogTitle>Work Reassignment Workspace</DialogTitle>
                        <DialogDescription>
                            Choose a team member and reassign owned work before suspending access or rebalancing operational load.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-2">Team member</p>
                            <Select value={reassignmentWorkspaceUserId} onValueChange={handleWorkspaceUserChange}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="Select a user to review" />
                                </SelectTrigger>
                                <SelectContent>
                                    {institutionReassignmentCandidates.map((entry) => (
                                        <SelectItem key={entry._id} value={entry._id}>
                                            {entry.name} ({entry.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {currentReassignmentTarget ? (
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-gray-900">{currentReassignmentTarget.name}</p>
                                        <p className="text-sm text-gray-600 mt-1">{currentReassignmentTarget.role} · {currentReassignmentTarget.email}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">{currentReassignmentTarget.workloadSummary?.learnersOwned ?? 0} learners</Badge>
                                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{currentReassignmentTarget.workloadSummary?.activePlacementsOwned ?? 0} placements</Badge>
                                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{getBlockerCount(deactivationImpact)} blocker items</Badge>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {reassignmentLoading ? (
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                Loading reassignment workspace...
                            </div>
                        ) : null}

                        {deactivationImpact && !reassignmentLoading ? (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600">
                                    {deactivationImpact.message}
                                </p>

                                {deactivationImpact.blockers.learnersOwned.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                        <p className="text-sm font-black text-gray-900">Learners Owned</p>
                                        {deactivationImpact.blockers.learnersOwned.map((item) => (
                                            <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                <p className="text-sm text-gray-700">{item.name}{item.trackingId ? ` · ${item.trackingId}` : ""}</p>
                                                <div className="flex gap-2">
                                                    <Select value={reassignmentDrafts[`learner:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`learner:${item._id}`]: value }))}>
                                                        <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new owner" /></SelectTrigger>
                                                        <SelectContent>{reassignmentOptions.ownerCandidates.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Button className="rounded-xl" onClick={() => handleReassign("learner", item._id)}>Reassign</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {deactivationImpact.blockers.activePlacementsOwned.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                        <p className="text-sm font-black text-gray-900">Active Placements Owned</p>
                                        {deactivationImpact.blockers.activePlacementsOwned.map((item) => (
                                            <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                <p className="text-sm text-gray-700">{item.companyName}{item.learnerName ? ` · ${item.learnerName}` : ""}{item.learnerTrackingId ? ` · ${item.learnerTrackingId}` : ""}</p>
                                                <div className="flex gap-2">
                                                    <Select value={reassignmentDrafts[`placement:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`placement:${item._id}`]: value }))}>
                                                        <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new owner" /></SelectTrigger>
                                                        <SelectContent>{reassignmentOptions.ownerCandidates.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Button className="rounded-xl" onClick={() => handleReassign("placement", item._id)}>Reassign</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {deactivationImpact.blockers.partnerPlacementsAssigned.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                        <p className="text-sm font-black text-gray-900">Partner Placements Assigned</p>
                                        {deactivationImpact.blockers.partnerPlacementsAssigned.map((item) => (
                                            <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                <p className="text-sm text-gray-700">{item.companyName}{item.learnerName ? ` · ${item.learnerName}` : ""}{item.learnerTrackingId ? ` · ${item.learnerTrackingId}` : ""}</p>
                                                <div className="flex gap-2">
                                                    <Select value={reassignmentDrafts[`partnerPlacement:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`partnerPlacement:${item._id}`]: value }))}>
                                                        <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new supervisor" /></SelectTrigger>
                                                        <SelectContent>{reassignmentOptions.partnerSupervisors.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Button className="rounded-xl" onClick={() => handleReassign("partnerPlacement", item._id)}>Reassign</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {deactivationImpact.blockers.supportAssignments.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                        <p className="text-sm font-black text-gray-900">Support Assignments</p>
                                        {deactivationImpact.blockers.supportAssignments.map((item) => (
                                            <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                <p className="text-sm text-gray-700">{item.subject}{item.institution ? ` · ${item.institution}` : ""}</p>
                                                <div className="flex gap-2">
                                                    <Select value={reassignmentDrafts[`supportAssignment:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`supportAssignment:${item._id}`]: value }))}>
                                                        <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select assignee" /></SelectTrigger>
                                                        <SelectContent>{reassignmentOptions.supportAssignees.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Button className="rounded-xl" onClick={() => handleReassign("supportAssignment", item._id)}>Reassign</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {deactivationImpact.blockers.supportEscalations.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                        <p className="text-sm font-black text-gray-900">Support Escalations</p>
                                        {deactivationImpact.blockers.supportEscalations.map((item) => (
                                            <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                <p className="text-sm text-gray-700">{item.subject}{item.institution ? ` · ${item.institution}` : ""}</p>
                                                <div className="flex gap-2">
                                                    <Select value={reassignmentDrafts[`supportEscalation:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`supportEscalation:${item._id}`]: value }))}>
                                                        <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select escalation owner" /></SelectTrigger>
                                                        <SelectContent>{reassignmentOptions.supportAssignees.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Button className="rounded-xl" onClick={() => handleReassign("supportEscalation", item._id)}>Reassign</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {getBlockerCount(deactivationImpact) === 0 ? (
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                                        This user has no active blockers. You can suspend the account directly from the user actions menu or bulk suspension workflow.
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
             </Dialog>
             <Dialog open={Boolean(deactivationImpact) && !reassignmentWorkspaceOpen} onOpenChange={(open) => { if (!open) { setDeactivationImpact(null); setBlockedUser(null) } }}>
                <DialogContent className="sm:max-w-[760px] overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Reassign Work Before Deactivation</DialogTitle>
                        <DialogDescription>
                            {deactivationImpact?.message || "This user still owns active work that must be reassigned before access can be removed."}
                        </DialogDescription>
                    </DialogHeader>
                    {deactivationImpact ? (
                        <div className="space-y-4">
                            {reassignmentLoading ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                    Loading reassignment options...
                                </div>
                            ) : null}

                            {deactivationImpact.blockers.learnersOwned.length > 0 ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                    <p className="text-sm font-black text-gray-900">Learners Owned</p>
                                    {deactivationImpact.blockers.learnersOwned.map((item) => (
                                        <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                            <p className="text-sm text-gray-700">{item.name}{item.trackingId ? ` · ${item.trackingId}` : ""}</p>
                                            <div className="flex gap-2">
                                                <Select value={reassignmentDrafts[`learner:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`learner:${item._id}`]: value }))}>
                                                    <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new owner" /></SelectTrigger>
                                                    <SelectContent>{reassignmentOptions.ownerCandidates.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button className="rounded-xl" onClick={() => handleReassign("learner", item._id)}>Reassign</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {deactivationImpact.blockers.activePlacementsOwned.length > 0 ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                    <p className="text-sm font-black text-gray-900">Active Placements Owned</p>
                                    {deactivationImpact.blockers.activePlacementsOwned.map((item) => (
                                        <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                            <p className="text-sm text-gray-700">{item.companyName}{item.learnerName ? ` · ${item.learnerName}` : ""}{item.learnerTrackingId ? ` · ${item.learnerTrackingId}` : ""}</p>
                                            <div className="flex gap-2">
                                                <Select value={reassignmentDrafts[`placement:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`placement:${item._id}`]: value }))}>
                                                    <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new owner" /></SelectTrigger>
                                                    <SelectContent>{reassignmentOptions.ownerCandidates.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button className="rounded-xl" onClick={() => handleReassign("placement", item._id)}>Reassign</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {deactivationImpact.blockers.partnerPlacementsAssigned.length > 0 ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                    <p className="text-sm font-black text-gray-900">Partner Placements Assigned</p>
                                    {deactivationImpact.blockers.partnerPlacementsAssigned.map((item) => (
                                        <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                            <p className="text-sm text-gray-700">{item.companyName}{item.learnerName ? ` · ${item.learnerName}` : ""}{item.learnerTrackingId ? ` · ${item.learnerTrackingId}` : ""}</p>
                                            <div className="flex gap-2">
                                                <Select value={reassignmentDrafts[`partnerPlacement:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`partnerPlacement:${item._id}`]: value }))}>
                                                    <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select new supervisor" /></SelectTrigger>
                                                    <SelectContent>{reassignmentOptions.partnerSupervisors.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button className="rounded-xl" onClick={() => handleReassign("partnerPlacement", item._id)}>Reassign</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {deactivationImpact.blockers.supportAssignments.length > 0 ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                    <p className="text-sm font-black text-gray-900">Support Assignments</p>
                                    {deactivationImpact.blockers.supportAssignments.map((item) => (
                                        <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                            <p className="text-sm text-gray-700">{item.subject}{item.institution ? ` · ${item.institution}` : ""}</p>
                                            <div className="flex gap-2">
                                                <Select value={reassignmentDrafts[`supportAssignment:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`supportAssignment:${item._id}`]: value }))}>
                                                    <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select assignee" /></SelectTrigger>
                                                    <SelectContent>{reassignmentOptions.supportAssignees.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button className="rounded-xl" onClick={() => handleReassign("supportAssignment", item._id)}>Reassign</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {deactivationImpact.blockers.supportEscalations.length > 0 ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                                    <p className="text-sm font-black text-gray-900">Support Escalations</p>
                                    {deactivationImpact.blockers.supportEscalations.map((item) => (
                                        <div key={item._id} className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                            <p className="text-sm text-gray-700">{item.subject}{item.institution ? ` · ${item.institution}` : ""}</p>
                                            <div className="flex gap-2">
                                                <Select value={reassignmentDrafts[`supportEscalation:${item._id}`] || ""} onValueChange={(value) => setReassignmentDrafts((current) => ({ ...current, [`supportEscalation:${item._id}`]: value }))}>
                                                    <SelectTrigger className="w-[220px] rounded-xl"><SelectValue placeholder="Select escalation owner" /></SelectTrigger>
                                                    <SelectContent>{reassignmentOptions.supportAssignees.map((candidate) => <SelectItem key={candidate._id} value={candidate._id}>{candidate.name} ({candidate.role})</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Button className="rounded-xl" onClick={() => handleReassign("supportEscalation", item._id)}>Reassign</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <Button variant="outline" onClick={() => setDeactivationImpact(null)} className="w-full rounded-2xl">
                                Close
                            </Button>
                        </div>
                    ) : null}
                </DialogContent>
             </Dialog>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-2 px-4 sm:px-0">
                <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                   <UsersIcon className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
                   User Management
                </h2>
                <p className="text-muted-foreground">
                    Manage system users, roles, and access levels.
                </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center w-full md:w-auto mt-4 md:mt-0 space-y-2 sm:space-y-0 sm:space-x-2">
                    {user?.role === "RegionalAdmin" ? (
                        <Button variant="outline" onClick={() => setEscalationOpen(true)} className="w-full sm:w-auto rounded-2xl border-gray-200">
                            <ShieldAlert className="mr-2 h-4 w-4" />
                            Escalate to HQ
                        </Button>
                    ) : null}
                    <Button data-help-id="users-add" onClick={() => { setEditingUser(null); setUserFormPrefill(null); setImplementationApprovalId(null); setOpen(true); }} className="w-full sm:w-auto bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-8 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
                        <Plus className="mr-3 h-5 w-5" /> Add User
                    </Button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh] bg-white border-gray-200 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-600 [&>button]:hover:bg-gray-200 [&>button]:hover:text-gray-900">
                            <DialogHeader>
                            <DialogTitle className="text-gray-900">{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                            <DialogDescription className="text-gray-600">
                                {userFormPrefill && !editingUser
                                    ? 'Complete the approved access request with the role and scope already prefilled.'
                                    : editingUser
                                        ? 'Update the user details and role.'
                                        : 'Enter the details of the new system user.'}
                            </DialogDescription>
                            </DialogHeader>
                            <UserForm onSuccess={handleSuccess} initialData={(editingUser as any) || userFormPrefill || undefined} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {user?.role === "SuperAdmin" && (hqGovernanceOverview || hqRoleGovernance) ? (
                <>
                    <Card data-help-id="users-governance" className="rounded-[2.5rem] border-none shadow-lg bg-gradient-to-r from-[#0f172a] via-[#111827] to-[#172554] text-white overflow-hidden">
                        <CardContent className="p-6 md:p-7 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-300">HQ Governance</p>
                                <h3 className="mt-2 text-2xl font-black">Platform-wide user directory</h3>
                                <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                                    Review access across every region, monitor risky accounts, and work the access approval inbox without leaving user management.
                                </p>
                            </div>
                            <div className="w-full xl:w-[320px]">
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 mb-2">Cross-region filter</p>
                                <Select value={regionFilter || "all"} onValueChange={(value) => {
                                    setSearchParams((prev) => {
                                        const next = new URLSearchParams(prev)
                                        if (value === "all") {
                                            next.delete("region")
                                        } else {
                                            next.set("region", value)
                                        }
                                        return next
                                    })
                                }}>
                                    <SelectTrigger className="rounded-2xl border-white/15 bg-white/10 text-white">
                                        <SelectValue placeholder="All regions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All regions</SelectItem>
                                        {hqRegionOptions.map((region) => (
                                            <SelectItem key={region} value={region}>{region}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 px-4 sm:px-0">
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Total Users</p><p className="text-3xl font-black text-gray-900 mt-1">{hqGovernanceOverview?.totalUsers ?? data.length}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Regions</p><p className="text-3xl font-black text-gray-900 mt-1">{hqGovernanceOverview?.regionStats.length ?? hqRoleGovernance?.regionStats.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Risky Accounts</p><p className="text-3xl font-black text-red-600 mt-1">{hqGovernanceOverview?.riskyAccounts.total ?? hqRoleGovernance?.riskyAccounts.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Pending Approvals</p><p className="text-3xl font-black text-amber-600 mt-1">{accessApprovalViews.pending.length}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Dormant Privileged</p><p className="text-3xl font-black text-sky-600 mt-1">{hqGovernanceOverview?.dormantPrivilegedAccounts.total ?? hqRoleGovernance?.dormantPrivilegedAccounts.length ?? 0}</p></CardContent></Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 px-4 sm:px-0">
                        <button
                            type="button"
                            onClick={() => setSearchParams((prev) => {
                                const next = new URLSearchParams(prev)
                                next.set("governance", "pending-approvals")
                                return next
                            })}
                            className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-left"
                        >
                            <p className="text-sm text-amber-700">Awaiting decision</p>
                            <p className="mt-1 text-3xl font-black text-amber-900">{accessApprovalViews.pending.length}</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSearchParams((prev) => {
                                const next = new URLSearchParams(prev)
                                next.set("governance", "approved-awaiting-implementation")
                                return next
                            })}
                            className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-left"
                        >
                            <p className="text-sm text-emerald-700">Approved, not implemented</p>
                            <p className="mt-1 text-3xl font-black text-emerald-900">{accessApprovalViews.approvedAwaitingImplementation.length}</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSearchParams((prev) => {
                                const next = new URLSearchParams(prev)
                                next.set("governance", "rejected-approvals")
                                return next
                            })}
                            className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-left"
                        >
                            <p className="text-sm text-rose-700">Rejected</p>
                            <p className="mt-1 text-3xl font-black text-rose-900">{accessApprovalViews.rejected.length}</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSearchParams((prev) => {
                                const next = new URLSearchParams(prev)
                                next.set("governance", "implemented-approvals")
                                return next
                            })}
                            className="rounded-[2rem] border border-sky-200 bg-sky-50 p-5 text-left"
                        >
                            <p className="text-sm text-sky-700">Implemented</p>
                            <p className="mt-1 text-3xl font-black text-sky-900">{accessApprovalViews.implemented.length}</p>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden xl:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">Role Governance Dashboard</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-5">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(hqGovernanceOverview?.roleCounts ?? hqRoleGovernance?.roleCounts ?? {})
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([role, count]) => (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => setSearchParams((prev) => {
                                                    const next = new URLSearchParams(prev)
                                                    next.set("role", role)
                                                    return next
                                                })}
                                                className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:bg-gray-100"
                                            >
                                                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">{role}</p>
                                                <p className="mt-2 text-2xl font-black text-gray-900">{count}</p>
                                            </button>
                                        ))}
                                </div>
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-sm font-black text-gray-900">Cross-Region Distribution</p>
                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {(hqGovernanceOverview?.regionStats ?? hqRoleGovernance?.regionStats ?? []).map((entry) => (
                                            <button
                                                key={entry.region}
                                                type="button"
                                                onClick={() => setSearchParams((prev) => {
                                                    const next = new URLSearchParams(prev)
                                                    next.set("region", entry.region)
                                                    return next
                                                })}
                                                className="rounded-2xl border border-white bg-white p-4 text-left transition hover:bg-gray-50"
                                            >
                                                <p className="font-bold text-gray-900">{entry.region}</p>
                                                <p className="mt-1 text-sm text-gray-500">{entry.totalUsers} users</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{entry.privilegedUsers} privileged</Badge>
                                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.invitedUsers} invited</Badge>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">
                                    {governanceFilter === "approved-awaiting-implementation"
                                        ? "Approved Awaiting Implementation"
                                        : governanceFilter === "rejected-approvals"
                                            ? "Rejected Approval History"
                                            : governanceFilter === "implemented-approvals"
                                                ? "Implemented Approval History"
                                                : "Approval Workflow Queue"}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-3">
                                {approvalQueueItems.length ? paginatedApprovalQueueItems.map((ticket) => (
                                    <div key={ticket._id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-gray-900">{ticket.subject}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {ticket.requester?.name || "Unknown requester"} · {ticket.requester?.role || "Unknown role"} · {ticket.institution || ticket.region || "Platform"}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {ticket.requestType ? <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{ticket.requestType}</Badge> : null}
                                                <Badge className="bg-amber-100 text-amber-700 border-amber-200">{ticket.priority}</Badge>
                                                <Badge className={ticket.status === "Pending"
                                                    ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                                                    : ticket.status === "Rejected"
                                                        ? "bg-rose-100 text-rose-700 border-rose-200"
                                                        : ticket.implementedAt
                                                            ? "bg-sky-100 text-sky-700 border-sky-200"
                                                            : "bg-emerald-100 text-emerald-700 border-emerald-200"}>
                                                    {ticket.status === "Pending"
                                                        ? "Awaiting Decision"
                                                        : ticket.status === "Rejected"
                                                            ? "Rejected"
                                                            : ticket.implementedAt
                                                                ? "Implemented"
                                                                : "Awaiting Implementation"}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between gap-3">
                                            <div className="text-xs text-gray-500">
                                                <p>Opened {new Date(ticket.createdAt).toLocaleDateString()}</p>
                                                {ticket.implementedAt ? (
                                                    <p>Implemented {new Date(ticket.implementedAt).toLocaleDateString()}</p>
                                                ) : null}
                                                {ticket.decisionComment ? (
                                                    <p className="mt-1 line-clamp-2">Decision note: {ticket.decisionComment}</p>
                                                ) : null}
                                            </div>
                                            <div className="flex gap-2">
                                                {ticket.status === "Pending" ? (
                                                    <Button variant="outline" className="rounded-xl" onClick={() => {
                                                        setSelectedApproval(ticket)
                                                        setApprovalDecision("Approved")
                                                        setApprovalComment("")
                                                        setApprovalDecisionOpen(true)
                                                    }}>
                                                        Decide
                                                    </Button>
                                                ) : null}
                                                {ticket.status === "Approved" && !ticket.implementedAt ? (
                                                    <Button variant="outline" className="rounded-xl" onClick={() => {
                                                        setImplementationApprovalId(ticket._id)
                                                        setEditingUser(ticket.targetUser ? ticket.targetUser as User : null)
                                                        setUserFormPrefill({
                                                            _id: ticket.targetUser?._id,
                                                            name: ticket.targetUser?.name || "",
                                                            email: ticket.targetUser?.email || "",
                                                            role: ticket.requestedRole || ticket.targetUser?.role || "Staff",
                                                            status: "Active",
                                                            phone: "",
                                                            institution: ticket.requestedInstitution || ticket.targetUser?.institution || "",
                                                            region: ticket.requestedRegion || ticket.targetUser?.region || "",
                                                            partnerId: "",
                                                        })
                                                        setOpen(true)
                                                    }}>
                                                        Implement
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                        No access approvals match the selected history view.
                                    </div>
                                )}
                                {approvalQueueItems.length > GOVERNANCE_PAGE_SIZE ? (
                                    <div className="flex items-center justify-between pt-2">
                                        <p className="text-xs text-gray-500">
                                            Page {approvalQueuePage} of {Math.max(1, Math.ceil(approvalQueueItems.length / GOVERNANCE_PAGE_SIZE))}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="rounded-xl" disabled={approvalQueuePage === 1} onClick={() => setApprovalQueuePage((page) => Math.max(1, page - 1))}>
                                                Previous
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                disabled={approvalQueuePage >= Math.ceil(approvalQueueItems.length / GOVERNANCE_PAGE_SIZE)}
                                                onClick={() => setApprovalQueuePage((page) => page + 1)}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">Anomaly Flags</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-3">
                                {(hqGovernanceOverview?.riskyAccounts.items ?? paginatedAnomalyItems).length ? (hqGovernanceOverview?.riskyAccounts.items ?? paginatedAnomalyItems).map((entry) => {
                                    const failedLogins = entry.auditSummary?.failedLoginCount ?? 0
                                    const reasons = [
                                        failedLogins >= 5 ? `${failedLogins} failed logins` : "",
                                        ["SuperAdmin", "RegionalAdmin", "Admin"].includes(entry.role) && entry.status === "Inactive" ? "Privileged account inactive" : "",
                                        (entry.auditSummary?.recentSensitiveActions?.length ?? 0) >= 3 ? "High recent sensitive activity" : "",
                                    ].filter(Boolean)

                                    return (
                                        <div key={entry._id} className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-gray-900">{entry.name}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{entry.email} · {entry.role}</p>
                                                </div>
                                                <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-100" onClick={() => setAuditUser(entry)}>
                                                    Review Audit
                                                </Button>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {reasons.map((reason) => (
                                                    <Badge key={reason} className="bg-white text-red-700 border-red-200">{reason}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                        No risky accounts are currently flagged by the user governance rules.
                                    </div>
                                )}
                                {(hqGovernanceOverview?.riskyAccounts.total ?? hqRoleGovernance?.riskyAccounts.length ?? 0) > GOVERNANCE_PAGE_SIZE ? (
                                    <div className="flex items-center justify-between pt-2">
                                        <p className="text-xs text-gray-500">
                                            Page {anomalyPage} of {Math.max(1, hqGovernanceOverview?.riskyAccounts.totalPages ?? Math.ceil((hqRoleGovernance?.riskyAccounts.length ?? 0) / GOVERNANCE_PAGE_SIZE))}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="rounded-xl" disabled={anomalyPage === 1} onClick={() => setAnomalyPage((page) => Math.max(1, page - 1))}>
                                                Previous
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                disabled={anomalyPage >= Math.max(1, hqGovernanceOverview?.riskyAccounts.totalPages ?? Math.ceil((hqRoleGovernance?.riskyAccounts.length ?? 0) / GOVERNANCE_PAGE_SIZE))}
                                                onClick={() => setAnomalyPage((page) => page + 1)}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">Dormant Privileged Accounts</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-3">
                                {(hqGovernanceOverview?.dormantPrivilegedAccounts.items ?? paginatedDormantItems).length ? (hqGovernanceOverview?.dormantPrivilegedAccounts.items ?? paginatedDormantItems).map((entry) => {
                                    const dormantDays = entry.lastLoginAt
                                        ? Math.max(0, Math.floor((Date.now() - new Date(entry.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24)))
                                        : null
                                    return (
                                        <div key={entry._id} className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-gray-900">{entry.name}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{entry.role} · {entry.effectiveRegion || entry.institution || "Platform"}</p>
                                                </div>
                                                <Badge className="bg-white text-sky-700 border-sky-200">
                                                    {dormantDays === null ? "Never logged in" : `${dormantDays} days dormant`}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <p className="text-xs text-gray-500">
                                                    {entry.lastLoginAt ? `Last login: ${new Date(entry.lastLoginAt).toLocaleString()}` : "No successful login on record"}
                                                </p>
                                                <Button variant="outline" className="rounded-xl" onClick={() => handleSendSetupLink(entry)}>
                                                    Send reset link
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                        No dormant privileged accounts are currently flagged.
                                    </div>
                                )}
                                {(hqGovernanceOverview?.dormantPrivilegedAccounts.total ?? hqRoleGovernance?.dormantPrivilegedAccounts.length ?? 0) > GOVERNANCE_PAGE_SIZE ? (
                                    <div className="flex items-center justify-between pt-2">
                                        <p className="text-xs text-gray-500">
                                            Page {dormantPage} of {Math.max(1, hqGovernanceOverview?.dormantPrivilegedAccounts.totalPages ?? Math.ceil((hqRoleGovernance?.dormantPrivilegedAccounts.length ?? 0) / GOVERNANCE_PAGE_SIZE))}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="rounded-xl" disabled={dormantPage === 1} onClick={() => setDormantPage((page) => Math.max(1, page - 1))}>
                                                Previous
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                disabled={dormantPage >= Math.max(1, hqGovernanceOverview?.dormantPrivilegedAccounts.totalPages ?? Math.ceil((hqRoleGovernance?.dormantPrivilegedAccounts.length ?? 0) / GOVERNANCE_PAGE_SIZE))}
                                                onClick={() => setDormantPage((page) => page + 1)}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}

            {user?.role === "RegionalAdmin" && (regionalOversightOverview || regionalOversightStats) ? (
                <>
                    <Card className="rounded-[2.5rem] border-none shadow-lg bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white overflow-hidden">
                        <CardContent className="p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-300">Regional Scope</p>
                                <h3 className="mt-2 text-2xl font-black">{user.region || "Regional directory"}</h3>
                                <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                                    This directory is already scoped to institutions inside your assigned region. Use the institution oversight cards below to monitor admin coverage, pending invites, and setup gaps.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge className="bg-white/10 text-white border-white/20 rounded-full px-4 py-1.5">
                                    {regionalOversightOverview?.visibleUsers ?? filteredData.length} visible users
                                </Badge>
                                <Badge className="bg-white/10 text-white border-white/20 rounded-full px-4 py-1.5">
                                    {regionalOversightOverview?.summary.institutions ?? regionalOversightStats?.institutions ?? 0} institutions in scope
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 sm:px-0">
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Institutions</p><p className="text-3xl font-black text-gray-900 mt-1">{regionalOversightOverview?.summary.institutions ?? regionalOversightStats?.institutions ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Missing Active Admin</p><p className="text-3xl font-black text-red-600 mt-1">{regionalOversightOverview?.summary.institutionsMissingAdmin ?? regionalOversightStats?.institutionsMissingAdmin ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Invited Users</p><p className="text-3xl font-black text-amber-600 mt-1">{regionalOversightOverview?.summary.invitedUsers ?? regionalOversightStats?.invitedUsers ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Password Setup Pending</p><p className="text-3xl font-black text-sky-600 mt-1">{regionalOversightOverview?.summary.passwordResetsPending ?? regionalOversightStats?.passwordResetsPending ?? 0}</p></CardContent></Card>
                    </div>

                    <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                        <CardHeader>
                            <CardTitle className="text-xl font-black text-gray-900">Regional Institution Oversight</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {(regionalOversightOverview?.institutions ?? regionalInstitutionStats).map((entry) => (
                                    <div key={entry.institution} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-black text-gray-900">{entry.institution}</p>
                                                <p className="text-sm text-gray-500 mt-1">{entry.totalUsers} total users · {entry.activeUsers} active</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {entry.admins === 0 ? (
                                                    <Badge className="bg-red-100 text-red-700 border-red-200">No active admin</Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{entry.admins} active admin{entry.admins > 1 ? "s" : ""}</Badge>
                                                )}
                                                {entry.invited > 0 ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.invited} invited</Badge> : null}
                                                {entry.passwordResetsPending > 0 ? <Badge className="bg-sky-100 text-sky-700 border-sky-200">{entry.passwordResetsPending} setup pending</Badge> : null}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-white bg-white p-4">
                                            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Institution Admin Oversight</p>
                                            {entry.adminDetails.length > 0 ? (
                                                <div className="mt-3 space-y-2">
                                                    {entry.adminDetails.map((admin) => (
                                                        <div key={admin._id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-gray-900 truncate">{admin.name}</p>
                                                                <p className="text-xs text-gray-500 truncate">{admin.email}</p>
                                                            </div>
                                                            <Badge className={admin.status === "Active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                                                                {admin.status}
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm text-red-700">
                                                    No institution admin account is active for this institution. Regional escalation to HQ may be required if this affects onboarding or access recovery.
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => openInstitutionFilter(entry.institution)}
                                            >
                                                View Institution Users
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => openInstitutionFilter(entry.institution, "password-reset-pending")}
                                            >
                                                View Pending Invites
                                            </Button>
                                            {entry.admins === 0 ? (
                                                <Button
                                                    variant="outline"
                                                    className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                                                    onClick={() => openEscalationForInstitution(entry.institution, "Institution has no active admin account in the regional directory.")}
                                                >
                                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                                    Escalate Coverage Gap
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </>
            ) : null}

            {user?.role === "Admin" && (institutionTeamOverview || institutionTeamStats) ? (
                <>
                    <Card className="rounded-[2.5rem] border-none shadow-lg bg-gradient-to-r from-stone-950 via-neutral-900 to-zinc-800 text-white overflow-hidden">
                        <CardContent className="p-6 md:p-7 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-stone-300">Institution Team</p>
                                <h3 className="mt-2 text-2xl font-black">{user.institution || "Institution team management"}</h3>
                                <p className="mt-2 text-sm text-stone-300 max-w-3xl">
                                    Add staff, reset access, suspend accounts after reassignment, and review team workload from one institution-scoped workspace.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="secondary"
                                    className="rounded-2xl bg-white text-gray-900 hover:bg-stone-100"
                                    onClick={() => openPrefilledUserForm({
                                            name: "",
                                            email: "",
                                            role: "Staff",
                                            status: "Active",
                                            phone: "",
                                            institution: user.institution || "",
                                            region: user.region || "",
                                            partnerId: "",
                                        linkedLearners: [],
                                    })}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Staff
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10"
                                    onClick={() => openPrefilledUserForm({
                                        name: "",
                                        email: "",
                                        role: "Guardian",
                                        status: "Active",
                                        phone: "",
                                        institution: user.institution || "",
                                        region: user.region || "",
                                        partnerId: "",
                                        linkedLearners: [],
                                    })}
                                >
                                    <UsersIcon className="mr-2 h-4 w-4" />
                                    Add Guardian
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10"
                                    onClick={() => setSearchParams((prev) => {
                                        const next = new URLSearchParams(prev)
                                        next.set("governance", "password-reset-pending")
                                        return next
                                    })}
                                >
                                    Reset Invite
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10"
                                    onClick={() => {
                                        setBulkSuspendSelection([])
                                        setBulkSuspendResults([])
                                        setBulkSuspendOpen(true)
                                    }}
                                >
                                    Suspend Access
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10"
                                    onClick={() => {
                                        const defaultUser = institutionReassignmentCandidates[0]
                                        if (!defaultUser) {
                                            toast.error("No institution workload owners are available to reassign")
                                            return
                                        }
                                        openReassignmentWorkspace(defaultUser)
                                    }}
                                >
                                    Reassign Work
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-4 sm:px-0">
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Team Members</p><p className="text-3xl font-black text-gray-900 mt-1">{institutionTeamOverview?.summary.teamMembers ?? institutionTeamStats?.teamUsers.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Managers</p><p className="text-3xl font-black text-blue-700 mt-1">{institutionTeamOverview?.summary.managers ?? institutionTeamStats?.managers.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Guardians</p><p className="text-3xl font-black text-teal-700 mt-1">{institutionTeamOverview?.summary.guardians ?? institutionTeamStats?.guardians.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Pending Invites</p><p className="text-3xl font-black text-amber-600 mt-1">{institutionTeamOverview?.summary.pendingInvites ?? institutionTeamStats?.pendingInvites.length ?? 0}</p></CardContent></Card>
                        <Card className="rounded-[2rem] border-none shadow-lg"><CardContent className="p-5"><p className="text-sm text-gray-500">Suspended</p><p className="text-3xl font-black text-rose-600 mt-1">{institutionTeamOverview?.summary.suspended ?? institutionTeamStats?.suspended.length ?? 0}</p></CardContent></Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">Role Guide</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    {
                                        role: "Admin",
                                        description: "Manages the institution team, access, and escalation decisions.",
                                        tone: "bg-purple-50 border-purple-100 text-purple-800",
                                    },
                                    {
                                        role: "Manager",
                                        description: "Coordinates learners, placements, and operational follow-up.",
                                        tone: "bg-blue-50 border-blue-100 text-blue-800",
                                    },
                                    {
                                        role: "Staff",
                                        description: "Handles day-to-day learner and placement tasks within assigned workload.",
                                        tone: "bg-slate-50 border-slate-200 text-slate-800",
                                    },
                                    {
                                        role: "Guardian",
                                        description: "Reads linked learner updates, reviews placement progress, and raises concerns through the family portal.",
                                        tone: "bg-teal-50 border-teal-100 text-teal-800",
                                    },
                                ].map((entry) => (
                                    <div key={entry.role} className={`rounded-2xl border p-4 ${entry.tone}`}>
                                        <p className="text-xs font-black uppercase tracking-[0.2em]">{entry.role}</p>
                                        <p className="mt-2 text-sm font-medium leading-6">{entry.description}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-900">Staff Workload</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-3">
                                {(institutionTeamOverview?.workloadOwners ?? institutionTeamStats?.workloadOwners.slice(0, 8) ?? []).length ? (institutionTeamOverview?.workloadOwners ?? institutionTeamStats?.workloadOwners.slice(0, 8) ?? []).map((entry) => (
                                    <div key={entry._id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-gray-900">{entry.name}</p>
                                                <p className="text-xs text-gray-500 mt-1">{entry.role} · {entry.email}</p>
                                            </div>
                                            <Badge className="bg-gray-900 text-white border-0">
                                                {(entry.workloadSummary?.learnersOwned ?? 0) + (entry.workloadSummary?.activePlacementsOwned ?? 0)} assignments
                                            </Badge>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{entry.workloadSummary?.learnersOwned ?? 0} learners</Badge>
                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{entry.workloadSummary?.activePlacementsOwned ?? 0} active placements</Badge>
                                            {entry.status === "Inactive" ? <Badge className="bg-rose-100 text-rose-700 border-rose-200">Suspended</Badge> : null}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                                        No learner or placement ownership is assigned to your institution team yet.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}

            {activeFilters.length > 0 && (
                <div className="px-4 sm:px-0">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {activeFilters.map((filter) => (
                                <span key={filter} className="text-xs font-black text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-full">
                                    {filter}
                                </span>
                            ))}
                        </div>
                        <Button variant="ghost" onClick={clearFilters} className="h-9 rounded-xl text-amber-700 hover:text-amber-800 hover:bg-amber-100">
                            <X className="h-4 w-4 mr-2" />
                            Clear Filters
                        </Button>
                    </div>
                </div>
            )}

            <div className="rounded-none sm:rounded-2xl md:rounded-[2.5rem] border-y sm:border border-gray-100 bg-white shadow-sm sm:shadow-xl overflow-hidden p-0 sm:p-2">
                {loading || tableLoading ? (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center space-x-4">
                           <Skeleton className="h-12 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    </div>
                ) : (
                    <>
                        <DataTable 
                            exportTitle="System Users Report"
                            data={governanceFilter ? filteredData : tableData}
                            columns={columns} 
                            meta={{ 
                                onEdit: handleEdit, 
                                onDelete: handleDelete,
                                onToggleStatus: handleToggleStatus,
                                onSendSetupLink: handleSendSetupLink,
                                onViewAudit: setAuditUser,
                                canManageUser,
                            }} 
                            sorting={sorting}
                            onSortingChange={setSorting}
                            disablePagination={!governanceFilter}
                        />
                        {!governanceFilter ? (
                            <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-medium text-gray-500">
                                    Showing {registryTotal === 0 ? 0 : (registryPage - 1) * registryPageSize + 1}-
                                    {Math.min(registryPage * registryPageSize, registryTotal)} of {registryTotal} users
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="rounded-xl"
                                        disabled={registryPage <= 1}
                                        onClick={() => setRegistryPage((page) => Math.max(1, page - 1))}
                                    >
                                        Previous
                                    </Button>
                                    <span className="min-w-[96px] text-center text-sm font-medium text-gray-600">
                                        Page {registryTotal === 0 ? 0 : registryPage} of {Math.max(registryTotalPages, 1)}
                                    </span>
                                    <Button
                                        variant="outline"
                                        className="rounded-xl"
                                        disabled={registryTotal === 0 || registryPage >= registryTotalPages}
                                        onClick={() => setRegistryPage((page) => Math.min(page + 1, Math.max(registryTotalPages, 1)))}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    )
}
