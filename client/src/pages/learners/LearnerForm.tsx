
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"


const formSchema = z.object({
  lastName: z.string().min(2, { message: "Last name is required" }),
  firstName: z.string().min(2, { message: "First name is required" }),
  middleName: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, { message: "Phone number is too short" }),
  guardianContact: z.string().optional(),
  indexNumber: z.string().min(2, "Index Number is required"),
  program: z.string().min(2, "Program is required"),
  year: z.string().min(2, "Year is required"),
  status: z.enum(["Pending", "Placed", "Completed", "Dropped"]),
})

type LearnerFormValues = z.infer<typeof formSchema>

interface LearnerFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: LearnerFormValues & { _id?: string };
}

export function LearnerForm({ onSuccess, initialData }: LearnerFormProps) {
  const [loading, setLoading] = useState(false)
  const [programs, setPrograms] = useState<string[]>([])
  const { authFetch } = useAuth()

  useEffect(() => {
    authFetch('/api/my-institution')
      .then(res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(data => {
        if (data?.programs) setPrograms(data.programs)
      })
      .catch(() => {})
  }, [authFetch])

  const form = useForm<LearnerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      lastName: "",
      firstName: "",
      middleName: "",
      gender: "Male",
      phone: "",
      guardianContact: "",
      indexNumber: "",
      program: "",
      year: "",
      status: "Pending",
    },
})

  async function onSubmit(values: LearnerFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/learners/${initialData._id}` : '/api/learners';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        if (!response.ok) throw new Error('Failed to save learner')
        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Name Fields */}
        <div className="grid grid-cols-3 gap-4">
          <FormField control={form.control} name="lastName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-white">Last Name</FormLabel>
                <FormControl><Input placeholder="Doe" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
          <FormField control={form.control} name="middleName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-white">Middle Name</FormLabel>
                <FormControl><Input placeholder="(Optional)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
          <FormField control={form.control} name="firstName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-white">First Name</FormLabel>
                <FormControl><Input placeholder="John" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
        </div>

        {/* Phone & Guardian */}
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Phone</FormLabel>
                  <FormControl><Input placeholder="024..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="guardianContact" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Guardian/Parent Contact</FormLabel>
                  <FormControl><Input placeholder="024..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>
        
        {/* Gender & Year */}
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Year</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Year 1">Year 1</SelectItem>
                      <SelectItem value="Year 2">Year 2</SelectItem>
                      <SelectItem value="Year 3">Year 3</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Index Number & Program */}
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="indexNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Index Number</FormLabel>
                  <FormControl><Input placeholder="GTVET/2026/001" className="uppercase" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="program" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Program</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-60">
                      {programs.map(prog => (
                          <SelectItem key={prog} value={prog} className="text-xs">{prog}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? 'Update Learner' : 'Register Learner'}
        </Button>
      </form>
    </Form>
  )
}
