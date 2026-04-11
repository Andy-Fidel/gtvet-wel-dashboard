
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
import { useState, useEffect, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import type { FieldErrors } from "react-hook-form"


const formSchema = z.object({
  lastName: z.string().min(2, { message: "Last name is required" }),
  firstName: z.string().min(2, { message: "First name is required" }),
  middleName: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]),
  dateOfBirth: z.string().optional(),
  phone: z.string().min(10, { message: "Phone number is too short" }),
  guardianContact: z.string().optional(),
  indexNumber: z.string().min(2, "Index Number is required"),
  program: z.string().min(2, "Program is required"),
  year: z.string().min(2, "Year is required"),
  intakeAcademicYear: z.string().optional(),
  academicStatus: z.enum(["Active", "Graduating", "Graduated", "Dropped"]),
  status: z.enum(["Pending", "Placed", "Completed", "Dropped"]),
})

type LearnerFormValues = z.infer<typeof formSchema>

const emptyValues: LearnerFormValues = {
  lastName: "",
  firstName: "",
  middleName: "",
  gender: "Male",
  dateOfBirth: "",
  phone: "",
  guardianContact: "",
  indexNumber: "",
  program: "",
  year: "",
  intakeAcademicYear: "",
  academicStatus: "Active",
  status: "Pending",
}

interface LearnerFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: Partial<LearnerFormValues> & { _id?: string };
    mode?: "register" | "profile-edit";
}

export function LearnerForm({ onSuccess, initialData, mode = "register" }: LearnerFormProps) {
  const [loading, setLoading] = useState(false)
  const [programs, setPrograms] = useState<string[]>([])
  const { authFetch } = useAuth()
  const coalesceLearnerFormValues = (source?: Partial<LearnerFormValues>): LearnerFormValues => ({
    lastName: source?.lastName ?? "",
    firstName: source?.firstName ?? "",
    middleName: source?.middleName ?? "",
    gender: source?.gender ?? "Male",
    dateOfBirth: source?.dateOfBirth ? String(source.dateOfBirth).slice(0, 10) : "",
    phone: source?.phone ?? "",
    guardianContact: source?.guardianContact ?? "",
    indexNumber: source?.indexNumber ?? "",
    program: source?.program ?? "",
    year: source?.year ?? "",
    intakeAcademicYear: source?.intakeAcademicYear ?? "",
    academicStatus: source?.academicStatus ?? "Active",
    status: source?.status ?? "Pending",
  })
  const normalizedInitialData = useMemo(() => (
    initialData ? coalesceLearnerFormValues(initialData) : undefined
  ), [initialData])

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
    defaultValues: normalizedInitialData || emptyValues,
})
  const selectedProgramValue = form.watch("program")
  const selectedYearValue = form.watch("year")
  const yearOptions = Array.from(new Set(["Year 1", "Year 2", "Year 3", selectedYearValue].filter(Boolean)))
  const programOptions = Array.from(new Set([...(programs || []), selectedProgramValue].filter(Boolean)))

  useEffect(() => {
    form.reset(normalizedInitialData || emptyValues)
  }, [form, normalizedInitialData])

  const onInvalid = (errors: FieldErrors<LearnerFormValues>) => {
    const firstError = Object.values(errors)[0]
    const message = firstError && typeof firstError === "object" && "message" in firstError
      ? String(firstError.message)
      : "Please correct the highlighted fields before saving."
    toast.error(message)
  }

  async function onSubmit(values: LearnerFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/learners/${initialData._id}` : '/api/learners';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.message || 'Failed to save learner')
        const data = payload
        toast.success(initialData?._id ? "Learner profile updated successfully" : "Learner registered successfully")
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save learner. Please try again.")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-5">
        {mode === "profile-edit" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">Profile Update</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">Review and update the learner's biodata, academic details, and guardian information.</p>
            <p className="mt-1 text-xs text-gray-600">Use this form to keep the learner record current before placement, consent, and reporting workflows continue.</p>
          </div>
        ) : null}

        {/* Name Fields */}
        <div className="grid grid-cols-3 gap-4">
          <FormField control={form.control} name="lastName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Last Name</FormLabel>
                <FormControl><Input placeholder="Doe" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
          <FormField control={form.control} name="middleName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Middle Name</FormLabel>
                <FormControl><Input placeholder="(Optional)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
          <FormField control={form.control} name="firstName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">First Name</FormLabel>
                <FormControl><Input placeholder="John" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Date of Birth</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <p className="text-xs text-gray-500">Required to determine if parent or guardian consent is needed for under-18 WEL placements.</p>
                <FormMessage />
              </FormItem>
          )} />
        </div>

        {/* Phone & Guardian */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Phone</FormLabel>
                  <FormControl><Input placeholder="024..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="guardianContact" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Guardian/Parent Contact</FormLabel>
                  <FormControl><Input placeholder="024..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>
        
        {/* Gender & Year */}
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Gender</FormLabel>
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Study Year</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Index Number</FormLabel>
                  <FormControl><Input placeholder="GTVET/2026/001" className="uppercase" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="program" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Program</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-60">
                      {programOptions.map(prog => (
                          <SelectItem key={prog} value={prog} className="text-xs">{prog}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="intakeAcademicYear" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Intake Academic Year</FormLabel>
                  <FormControl><Input placeholder="2026/2027" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="academicStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Academic Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select academic status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Graduating">Graduating</SelectItem>
                      <SelectItem value="Graduated">Graduated</SelectItem>
                      <SelectItem value="Dropped">Dropped</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? (mode === "profile-edit" ? 'Save Profile Changes' : 'Update Learner') : 'Register Learner'}
        </Button>
      </form>
    </Form>
  )
}
