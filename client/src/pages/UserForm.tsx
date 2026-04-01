
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

const baseFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal('')),
  role: z.enum(["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff", "IndustryPartner"]),
  status: z.enum(["Active", "Inactive"]),
  phone: z.string().optional(),
  institution: z.string().optional(),
  region: z.string().optional(),
  partnerId: z.string().optional(),
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
});

type UserFormValues = z.infer<typeof baseFormSchema>

interface UserFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: UserFormValues & { 
        _id?: string; 
        partnerId?: string | { _id: string; name: string };
    };
}

export function UserForm({ onSuccess, initialData }: UserFormProps) {
  const [loading, setLoading] = useState(false)
  const [institutions, setInstitutions] = useState<{name: string, region: string}[]>([])
  const [partners, setPartners] = useState<{_id: string, name: string}[]>([])
  const { authFetch, user: currentUser } = useAuth()

  const getPartnerId = () => {
    const pId = initialData?.partnerId;
    if (pId && typeof pId === 'object' && '_id' in pId) {
        return (pId as { _id: string })._id;
    }
    return (pId as string) || "";
  };
  const defaultPartnerId = getPartnerId();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      email: "",
      password: "",
      role: currentUser?.role === 'RegionalAdmin' ? "Admin" : "Staff",
      status: "Active",
      phone: "",
      institution: currentUser?.role === 'RegionalAdmin' ? "" : (currentUser?.institution || ""),
      region: currentUser?.region || "",
      partnerId: defaultPartnerId,
    },
  })

  const selectedRole = form.watch("role");
  const uniqueRegions = Array.from(new Set(institutions.map(i => i.region))).filter(Boolean).sort();

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

  async function onSubmit(values: UserFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/users/${initialData._id}` : '/api/users';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save user')
        }
        const data = await response.json()
        if (data.defaultPassword) {
            toast.success(`User created successfully. Temporary password: ${data.defaultPassword}`, {
                duration: Number.POSITIVE_INFINITY,
            })
        }
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save user")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Full Name</FormLabel>
              <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Email Address</FormLabel>
              <FormControl><Input placeholder="john@example.com" type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">
                {initialData?._id ? "Change Password (optional)" : "Password (Optional - auto-generated if blank)"}
              </FormLabel>
              <FormControl><Input placeholder="••••••••" type="password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {currentUser?.role === 'SuperAdmin' && (
                            <>
                                <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                                <SelectItem value="RegionalAdmin">RegionalAdmin</SelectItem>
                                <SelectItem value="IndustryPartner">IndustryPartner</SelectItem>
                            </>
                        )}
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  <FormLabel className="text-sm font-semibold text-white">Phone</FormLabel>
                  <FormControl><Input placeholder="024 123 4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />

            {/* Institution field for SuperAdmin */}
            {currentUser?.role === 'SuperAdmin' && ['Admin', 'Manager', 'Staff'].includes(selectedRole) && (
                <FormField control={form.control} name="institution" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-white">Institution</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormLabel className="text-sm font-semibold text-white">Institution</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormLabel className="text-sm font-semibold text-white">Region</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormLabel className="text-sm font-semibold text-white">Industry Partner</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update User" : "Create User"}
        </Button>
      </form>
    </Form>
  )
}
