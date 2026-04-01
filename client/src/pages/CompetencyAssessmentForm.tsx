import { zodResolver } from "@hookform/resolvers/zod"
import type { Learner } from '@/types/models'
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState, useEffect } from "react"
import { Loader2, CalendarDays } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/Calendar"
import { safeDateString } from "@/lib/dateUtils"

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  assessmentDate: z.date(),
  assessmentType: z.enum(["Practical", "Theoretical", "Combined", "On-the-job"]),
  technicalSkills: z.string().min(5, "Please describe the technical skills assessed"),
  softSkills: z.string().min(5, "Please describe the soft skills assessed"),
  professionalism: z.number().min(1).max(5).int(),
  problemSolving: z.number().min(1).max(5).int(),
  overallScore: z.number().min(0).max(100),
  assessorName: z.string().min(2, "Assessor Name is required"),
  recommendations: z.string().optional(),
})

type AssessmentFormValues = z.infer<typeof formSchema>

// Learner type imported from @/types/models

interface CompetencyAssessmentFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: Partial<AssessmentFormValues> & { 
        _id?: string;
        learner?: string | { _id: string; name: string; trackingId: string };
    };
}

export function CompetencyAssessmentForm({ onSuccess, initialData }: CompetencyAssessmentFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const { authFetch } = useAuth()
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : Number(value))

  useEffect(() => {
    authFetch('/api/learners')
        .then(res => res.json())
        .then(data => setLearners(data))
        .catch(err => console.error("Error fetching learners:", err))
  }, [authFetch])

  const form = useForm<AssessmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        learner: (typeof initialData.learner === 'object' && initialData.learner)
            ? (initialData.learner as { _id: string })._id
            : (initialData.learner as string) || "",
        assessmentDate: safeDateString(initialData.assessmentDate),
        assessmentType: initialData.assessmentType || "Practical",
        technicalSkills: initialData.technicalSkills || "",
        softSkills: initialData.softSkills || "",
        professionalism: initialData.professionalism || 3,
        problemSolving: initialData.problemSolving || 3,
        overallScore: initialData.overallScore || 0,
        assessorName: initialData.assessorName || "",
        recommendations: initialData.recommendations || "",
    } : {
      learner: "",
      assessmentDate: new Date(),
      assessmentType: "Practical",
      technicalSkills: "",
      softSkills: "",
      professionalism: 3,
      problemSolving: 3,
      overallScore: 0,
      assessorName: "",
      recommendations: "",
    },
  })

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)

  async function onSubmit(values: AssessmentFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/assessments/${initialData._id}` : '/api/assessments';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || errData.message || 'Failed to save assessment');
        }
        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error("Error submitting assessment:", error)
        const { toast } = await import('sonner');
        toast.error(error instanceof Error ? error.message : 'Failed to save assessment');
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        
        <FormField control={form.control} name="learner" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Learner / Trainee</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select a learner" /></SelectTrigger></FormControl>
                <SelectContent>
                    {learners.map((learner) => (
                        <SelectItem key={learner._id} value={learner._id}>{learner.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
        )} />
        
        {selectedLearner && (
            <div className="px-4 py-3 bg-[#F5F5FA] rounded-xl">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tracking ID</p>
                <p className="text-sm font-bold text-gray-900">{selectedLearner.trackingId || 'N/A'}</p>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="assessmentDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-white">Assessment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("h-12 rounded-xl border-transparent bg-[#F5F5FA] text-gray-900 hover:bg-gray-100 text-left font-normal justify-start px-4", !field.value && "text-gray-400")}>
                          <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border-gray-100" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date: Date) => date > new Date() || date < new Date("1900-01-01")} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
             )} />
            <FormField control={form.control} name="assessmentType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Assessment Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Practical">Practical</SelectItem>
                        <SelectItem value="Theoretical">Theoretical</SelectItem>
                        <SelectItem value="Combined">Combined</SelectItem>
                        <SelectItem value="On-the-job">On-the-job</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="assessorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Assessor Name</FormLabel>
                  <FormControl><Input placeholder="Full Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="overallScore" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Overall Score (0-100)</FormLabel>
                  <FormControl><Input type="number" min="0" max="100" className="font-bold" {...field} value={Number.isFinite(field.value) ? field.value : ""} onChange={e => field.onChange(normalizeNumberInput(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="technicalSkills" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Technical Skills</FormLabel>
                  <FormControl><Textarea placeholder="Describe technical competencies..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="softSkills" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Soft Skills</FormLabel>
                  <FormControl><Textarea placeholder="Communication, teamwork..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="professionalism" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Professionalism (1-5)</FormLabel>
                  <FormControl>
                    <div className="flex items-center bg-[#F5F5FA] rounded-xl h-12 px-3">
                       <input type="range" min="1" max="5" step="1" value={Number.isFinite(field.value) ? field.value : 1} onChange={e => field.onChange(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-indigo-500 mx-2" />
                       <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">{field.value}</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="problemSolving" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Problem Solving (1-5)</FormLabel>
                  <FormControl>
                    <div className="flex items-center bg-[#F5F5FA] rounded-xl h-12 px-3">
                       <input type="range" min="1" max="5" step="1" value={Number.isFinite(field.value) ? field.value : 1} onChange={e => field.onChange(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-indigo-500 mx-2" />
                       <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">{field.value}</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="recommendations" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Recommendations</FormLabel>
              <FormControl><Textarea placeholder="What should the learner focus on improving?" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData?._id ? "Update Assessment" : "Save Assessment"}
        </Button>
      </form>
    </Form>
  )
}
