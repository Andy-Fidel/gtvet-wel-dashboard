
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"

const baseFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal('')),
  role: z.enum(["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff", "IndustryPartner", "Guardian"]),
  status: z.enum(["Active", "Inactive"]),
  phone: z.string().optional(),
  institution: z.string().optional(),
  region: z.string().optional(),
  partnerId: z.string().optional(),
  linkedLearners: z.array(z.string()).optional(),
});

const formSchema = baseFormSchema.refine((data) => {
  if (data.role === 'RegionalAdmin' && !data.region) return false;
  return true;
}, {
  message: "Region is required for Regional Admins",
  path: ["region"],
}).refine((data) => {
  if (['Admin', 'Manager', 'Staff'].includes(data.role) && !data.institution) return false;
  return true;
}, {
  message: "Institution is required for this role",
  path: ["institution"],
}).refine((data) => {
  if (data.role === 'IndustryPartner' && !data.partnerId) return false;
  return true;
}, {
  message: "Partner is required for Industry Partners",
  path: ["partnerId"],
}).refine((data) => {
  if (data.role === 'Guardian' && (!data.linkedLearners || data.linkedLearners.length === 0)) return false;
  return true;
}, {
  message: "At least one learner must be linked to a guardian",
  path: ["linkedLearners"],
});

type UserFormValues = z.infer<typeof baseFormSchema>

interface UserFormProps {
    onSuccess: (data: unknown) => void | Promise<void>;
    initialData?: UserFormValues & { 
        _id?: string; 
        partnerId?: string | { _id: string; name: string };
        linkedLearners?: Array<string | { _id: string; name: string; trackingId?: string; institution?: string }>;
    };
}

interface PrivilegedConfirmationState {
  role: UserFormValues["role"]
  previousRole: string | null
  scope: string
  values: UserFormValues
}

const ROLE_CONFIG = {
  SuperAdmin: {
    label: "SuperAdmin",
    description: "Platform-wide governance across all regions, institutions, and partners.",
    scopeLabel: "Platform-wide scope",
  },
  RegionalAdmin: {
    label: "RegionalAdmin",
    description: "Oversees institutions in a single region.",
    scopeLabel: "Region-scoped access",
  },
  Admin: {
    label: "Admin",
    description: "Leads institution operations and manages institution users.",
    scopeLabel: "Institution-scoped access",
  },
  Manager: {
    label: "Manager",
    description: "Coordinates day-to-day institution workflow and oversight.",
    scopeLabel: "Institution-scoped access",
  },
  Staff: {
    label: "Staff",
    description: "Handles operational data entry and learner workflow tasks.",
    scopeLabel: "Institution-scoped access",
  },
  IndustryPartner: {
    label: "IndustryPartner",
    description: "Represents a partner organization for workplace supervision workflows.",
    scopeLabel: "Partner-scoped access",
  },
  Guardian: {
    label: "Guardian",
    description: "Read-only guardian portal access for linked learners, with concern reporting and notifications.",
    scopeLabel: "Linked learner access",
  },
} as const

const getManageableRoles = (actorRole?: string) => {
  if (actorRole === "SuperAdmin") return ["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff", "IndustryPartner", "Guardian"] as const
  if (actorRole === "RegionalAdmin") return ["Admin", "Manager", "Staff", "Guardian"] as const
  return ["Manager", "Staff", "Guardian"] as const
}

export function UserForm({ onSuccess, initialData }: UserFormProps) {
  const [loading, setLoading] = useState(false)
  const [institutions, setInstitutions] = useState<{name: string, region: string}[]>([])
  const [partners, setPartners] = useState<{_id: string, name: string}[]>([])
  const [learnerOptions, setLearnerOptions] = useState<Array<{ _id: string; name: string; trackingId: string; institution?: string }>>([])
  const [confirmationState, setConfirmationState] = useState<PrivilegedConfirmationState | null>(null)
  const { authFetch, user: currentUser } = useAuth()

  const getPartnerId = () => {
    const pId = initialData?.partnerId;
    if (pId && typeof pId === 'object' && '_id' in pId) {
        return (pId as { _id: string })._id;
    }
    return (pId as string) || "";
  };
  const defaultPartnerId = getPartnerId();
  const getLinkedLearners = (): string[] =>
    ((initialData?.linkedLearners || []) as Array<string | { _id: string }>).map((learner) =>
      typeof learner === "string" ? learner : learner._id
    );

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      ...initialData,
      password: "",
      partnerId: defaultPartnerId,
    } : {
      name: "",
      email: "",
      password: "",
      role: currentUser?.role === 'SuperAdmin' ? "Staff" : currentUser?.role === 'RegionalAdmin' ? "Admin" : "Staff",
      status: "Active",
      phone: "",
      institution: currentUser?.role === 'Admin' ? (currentUser?.institution || "") : "",
      region: currentUser?.region || "",
      partnerId: "",
      linkedLearners: [],
    },
  })

  useEffect(() => {
    const nextValues: UserFormValues = initialData ? {
      ...initialData,
      password: "",
      partnerId: getPartnerId(),
    } : {
      name: "",
      email: "",
      password: "",
      role: currentUser?.role === 'SuperAdmin' ? "Staff" : currentUser?.role === 'RegionalAdmin' ? "Admin" : "Staff",
      status: "Active",
      phone: "",
      institution: currentUser?.role === 'Admin' ? (currentUser?.institution || "") : "",
      region: currentUser?.region || "",
      partnerId: "",
      linkedLearners: [],
    }

    nextValues.linkedLearners = initialData ? getLinkedLearners() : []

    form.reset(nextValues)
  }, [currentUser?.institution, currentUser?.region, currentUser?.role, form, initialData])

  const selectedRole = form.watch("role");
  const selectedInstitution = form.watch("institution")
  const uniqueRegions = Array.from(new Set(institutions.map(i => i.region))).filter(Boolean).sort();
  const allowedRoles = getManageableRoles(currentUser?.role)
  const roleOptions = Array.from(new Set([...(allowedRoles as readonly string[]), initialData?.role].filter(Boolean))) as Array<UserFormValues["role"]>
  const selectedRoleConfig = ROLE_CONFIG[selectedRole]
  const selectedInstitutionRecord = institutions.find((inst) => inst.name === selectedInstitution)
  const scopeSummary = selectedRole === "SuperAdmin"
    ? "This user will have platform-wide access."
    : selectedRole === "RegionalAdmin"
      ? `This user will manage institutions in ${form.watch("region") || "the selected region"}.`
      : selectedRole === "IndustryPartner"
        ? "This user will only access the selected partner organization's workspace."
        : selectedRole === "Guardian"
          ? `This user will only access the learners linked to this guardian account.`
        : `This user will be limited to ${selectedInstitution || currentUser?.institution || "the selected institution"}.`

  useEffect(() => {
    if (currentUser?.role === 'SuperAdmin' || currentUser?.role === 'RegionalAdmin') {
      const endpoint = currentUser?.role === 'RegionalAdmin' && currentUser?.region
        ? `/api/institutions?region=${encodeURIComponent(currentUser.region)}`
        : '/api/institutions';
      authFetch(endpoint)
        .then(res => res.json())
        .then(data => setInstitutions(Array.isArray(data) ? data : []))
        .catch(err => console.error("Error fetching institutions:", err))
    }
  }, [authFetch, currentUser])

  useEffect(() => {
    if (currentUser?.role === 'SuperAdmin') {
      authFetch('/api/industry-partners')
        .then(res => res.json())
        .then(data => setPartners(Array.isArray(data) ? data : []))
        .catch(err => console.error("Error fetching partners:", err))
    }
  }, [authFetch, currentUser])

  useEffect(() => {
    if (!['Guardian'].includes(selectedRole)) return

    const params = new URLSearchParams()
    const learnerScopeInstitution =
      currentUser?.role === "Admin"
        ? currentUser.institution || ""
        : selectedInstitution || ""
    if (learnerScopeInstitution) params.set("institution", learnerScopeInstitution)
    params.set("academicStatus", "CurrentEnrolled")

    authFetch(`/api/learners/options?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const fetchedLearners = Array.isArray(data) ? data : []
        const initialLinkedLearners = ((initialData?.linkedLearners || []) as Array<string | { _id: string; name: string; trackingId?: string; institution?: string }>)
          .filter((learner): learner is { _id: string; name: string; trackingId?: string; institution?: string } => typeof learner === "object" && learner !== null && "_id" in learner)

        const mergedLearners = [...fetchedLearners]
        initialLinkedLearners.forEach((learner) => {
          if (!mergedLearners.some((entry) => entry._id === learner._id)) {
            mergedLearners.push({
              _id: learner._id,
              name: learner.name,
              trackingId: learner.trackingId || "N/A",
              institution: learner.institution,
            })
          }
        })

        mergedLearners.sort((a, b) => a.name.localeCompare(b.name))
        setLearnerOptions(mergedLearners)
      })
      .catch((err) => console.error("Error fetching learners for guardian linking:", err))
  }, [authFetch, currentUser?.institution, currentUser?.role, initialData?.linkedLearners, selectedInstitution, selectedRole])

  useEffect(() => {
    if (["Admin", "Manager", "Staff"].includes(selectedRole)) {
      form.setValue("partnerId", "")
      if (currentUser?.role === "Admin") {
        form.setValue("institution", currentUser.institution || "")
      }
    } else if (selectedRole === "RegionalAdmin") {
      form.setValue("institution", "")
      form.setValue("partnerId", "")
    } else if (selectedRole === "IndustryPartner") {
      form.setValue("institution", "")
      form.setValue("linkedLearners", [])
    } else if (selectedRole === "Guardian") {
      form.setValue("partnerId", "")
    } else if (selectedRole === "SuperAdmin") {
      form.setValue("institution", "")
      form.setValue("region", "")
      form.setValue("partnerId", "")
      form.setValue("linkedLearners", [])
    }
  }, [currentUser?.institution, currentUser?.role, form, selectedRole])

  useEffect(() => {
    if (["Admin", "Manager", "Staff"].includes(selectedRole) && selectedInstitutionRecord?.region) {
      form.setValue("region", selectedInstitutionRecord.region)
    }
  }, [form, selectedInstitutionRecord, selectedRole])

  const persistUser = async (values: UserFormValues, privilegedRoleConfirmed = false) => {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/users/${initialData._id}` : '/api/users';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, privilegedRoleConfirmed }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            if (response.status === 409 && data.confirmationRequired) {
              setConfirmationState({
                ...data.confirmationRequired,
                values,
              })
              return
            }
            throw new Error(data.message || 'Failed to save user')
        }
        toast.success('User created successfully.')
        await onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save user")
    } finally {
        setLoading(false)
    }
  }

  async function onSubmit(values: UserFormValues) {
    await persistUser(values, false)
  }

  return (
    <Form {...form}>
      <Dialog open={Boolean(confirmationState)} onOpenChange={(open) => { if (!open) setConfirmationState(null) }}>
        <DialogContent className="sm:max-w-[560px] bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirm Privileged Role Change</DialogTitle>
            <DialogDescription className="text-gray-600">
              This role grants elevated access. Confirm the assignment before the user record is saved.
            </DialogDescription>
          </DialogHeader>
          {confirmationState ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Role Impact</p>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  {confirmationState.previousRole
                    ? `Changing role from ${confirmationState.previousRole} to ${confirmationState.role}`
                    : `Assigning ${confirmationState.role}`}
                </p>
                <p className="mt-1 text-sm text-gray-700">{confirmationState.scope}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-700">
                  Only continue if this user should manage broader access and governance responsibilities within that scope.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmationState(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"
                  onClick={async () => {
                    const state = confirmationState
                    setConfirmationState(null)
                    if (state) {
                      await persistUser(state.values, true)
                    }
                  }}
                >
                  Confirm Role Assignment
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">Role Assignment</p>
            <p className="mt-2 font-bold text-gray-900">{selectedRoleConfig.label}</p>
            <p className="mt-1 text-sm text-gray-700">{selectedRoleConfig.description}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500">Effective Scope</p>
            <p className="mt-2 font-bold text-gray-900">{selectedRoleConfig.scopeLabel}</p>
            <p className="mt-1 text-sm text-gray-600">{scopeSummary}</p>
          </div>
        </div>

        <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Full Name</FormLabel>
              <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Email Address</FormLabel>
              <FormControl><Input placeholder="john@example.com" type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">
                {initialData?._id ? "Change Password (optional)" : "Password (Optional - auto-generated if blank)"}
              </FormLabel>
              <FormControl><Input placeholder="••••••••" type="password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {roleOptions.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_CONFIG[role].label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Only roles within your governance scope are available here.</p>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Phone</FormLabel>
                  <FormControl><Input placeholder="024 123 4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />

            {/* Institution field for SuperAdmin */}
            {currentUser?.role === 'SuperAdmin' && ['Admin', 'Manager', 'Staff'].includes(selectedRole) && (
                <FormField control={form.control} name="institution" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900">Institution</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-[250px]">
                            {institutions.map((inst) => (
                                <SelectItem key={inst.name} value={inst.name}>{inst.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
            )}

            {/* Institution field for RegionalAdmin - always show when creating Admin/Manager/Staff */}
            {currentUser?.role === 'RegionalAdmin' && ['Admin', 'Manager', 'Staff'].includes(selectedRole) && (
                <FormField control={form.control} name="institution" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900">Institution</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-[250px]">
                            {institutions
                                .filter(inst => inst.region === currentUser?.region)
                                .map((inst) => (
                                    <SelectItem key={inst.name} value={inst.name}>{inst.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
            )}

            {/* Region field for SuperAdmin creating RegionalAdmins */}
            {currentUser?.role === 'SuperAdmin' && selectedRole === 'RegionalAdmin' && (
                <FormField control={form.control} name="region" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900">Region</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select Region" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-[250px]">
                            {uniqueRegions.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
            )}

            {/* Partner field for SuperAdmin creating IndustryPartners */}
            {currentUser?.role === 'SuperAdmin' && selectedRole === 'IndustryPartner' && (
                <FormField control={form.control} name="partnerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900">Industry Partner</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select Partner" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-[250px]">
                            {partners.map((p) => (
                                <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
            )}
        </div>

        {selectedRole === "Guardian" ? (
          <FormField control={form.control} name="linkedLearners" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Linked Learners</FormLabel>
              <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                {learnerOptions.length === 0 ? (
                  <p className="text-sm text-gray-500">No learners available for linking.</p>
                ) : learnerOptions.map((learner) => {
                  const checked = (field.value || []).includes(learner._id)
                  return (
                    <label key={learner._id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          const current = field.value || []
                          field.onChange(
                            nextChecked
                              ? [...current, learner._id]
                              : current.filter((value) => value !== learner._id)
                          )
                        }}
                      />
                      <div className="leading-tight">
                        <p className="font-semibold text-sm text-gray-900">{learner.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{learner.trackingId}</p>
                        {learner.institution ? <p className="text-xs text-gray-500 mt-1">{learner.institution}</p> : null}
                      </div>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500">Guardians can only view the learners linked here.</p>
              <FormMessage />
            </FormItem>
          )} />
        ) : null}

        {["Admin", "Manager", "Staff"].includes(selectedRole) && selectedInstitutionRecord ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-sky-700">Resolved Scope</p>
            <p className="mt-2 text-sm font-bold text-gray-900">{selectedInstitutionRecord.name}</p>
            <p className="mt-1 text-sm text-gray-600">Region: {selectedInstitutionRecord.region || "Not set"}</p>
          </div>
        ) : null}

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update User" : "Create User"}
        </Button>
      </form>
    </Form>
  )
}
