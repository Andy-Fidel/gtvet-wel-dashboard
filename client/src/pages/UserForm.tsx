
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
import { Loader2, User as UserIcon, Mail, Phone, Building2, ShieldCheck, Activity } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal('')),
  role: z.enum(["SuperAdmin", "Admin", "Manager", "Staff"]),
  status: z.enum(["Active", "Inactive"]),
  phone: z.string().optional(),
  institution: z.string().min(1, "Institution is required"),
})

type UserFormValues = z.infer<typeof formSchema>

interface UserFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: UserFormValues & { _id?: string };
}

export function UserForm({ onSuccess, initialData }: UserFormProps) {
  const [loading, setLoading] = useState(false)
  const [institutions, setInstitutions] = useState<{name: string}[]>([])
  const { authFetch, user: currentUser } = useAuth()

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      email: "",
      password: "",
      role: "Staff",
      status: "Active",
      phone: "",
      institution: currentUser?.institution || "",
    },
  })

  useEffect(() => {
    if (currentUser?.role === 'SuperAdmin') {
      authFetch('http://localhost:5001/api/institutions')
        .then(res => res.json())
        .then(data => setInstitutions(data))
        .catch(err => console.error("Error fetching institutions:", err))
    }
  }, [authFetch, currentUser])

  async function onSubmit(values: UserFormValues) {
    if (!initialData?._id && !values.password) {
        toast.error("Password is required for new users")
        return
    }

    setLoading(true)
    try {
        const url = initialData?._id 
            ? `http://localhost:5001/api/users/${initialData._id}`
            : 'http://localhost:5001/api/users';
        
        const method = initialData?._id ? 'PUT' : 'POST';

        const response = await authFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save user')
        }

        const data = await response.json()
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Full Name</FormLabel>
              <FormControl>
                <div className="relative">
                  <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <Input placeholder="John Doe" className="pl-14" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Email Address</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <Input placeholder="john@example.com" type="email" className="pl-14" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">
                {initialData?._id ? "Change Password (optional)" : "Password"}
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <ShieldCheck className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <Input placeholder="••••••••" type="password" className="pl-14" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <ShieldCheck className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                        {currentUser?.role === 'SuperAdmin' && (
                            <SelectItem value="SuperAdmin" className="text-white focus:bg-white/10 focus:text-white">SuperAdmin</SelectItem>
                        )}
                        <SelectItem value="Admin" className="text-white focus:bg-white/10 focus:text-white">Admin</SelectItem>
                        <SelectItem value="Manager" className="text-white focus:bg-white/10 focus:text-white">Manager</SelectItem>
                        <SelectItem value="Staff" className="text-white focus:bg-white/10 focus:text-white">Staff</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <Activity className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                        <SelectItem value="Active" className="text-white focus:bg-white/10 focus:text-white">Active</SelectItem>
                        <SelectItem value="Inactive" className="text-white focus:bg-white/10 focus:text-white">Inactive</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="grid grid-cols-2 gap-6">
            <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Phone</FormLabel>
                <FormControl>
                    <div className="relative">
                      <Phone className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="024 123 4567" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            {currentUser?.role === 'SuperAdmin' && (
                <FormField
                control={form.control}
                name="institution"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Institution</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <div className="relative">
                                <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                                <SelectTrigger className="pl-14">
                                    <SelectValue placeholder="Select institution" />
                                </SelectTrigger>
                            </div>
                        </FormControl>
                        <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                            {institutions.map((inst) => (
                                <SelectItem key={inst.name} value={inst.name} className="text-white focus:bg-white/10 focus:text-white">
                                    {inst.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            )}
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-14 rounded-2xl shadow-xl shadow-[#FFB800]/20 mt-6">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update User" : "Create User"}
        </Button>
      </form>
    </Form>
  )
}
