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
  weekEnding: z.date(),
  taskCompleted: z.string().min(5, "Please describe the tasks completed"),
  skillsPracticed: z.string().min(5, "Please list the skills practiced"),
  challengesFaced: z.string().optional(),
  hoursWorked: z.number().min(0, "Hours cannot be negative"),
  reportStatus: z.enum(["Draft", "Submitted", "Reviewed"]),
  supervisorComments: z.string().optional(),
})

type MonthlyReportFormValues = z.infer<typeof formSchema>

export interface MonthlyReportInitialData {
  _id?: string
  learner?: string | { _id: string }
  weekEnding?: string | Date
  taskCompleted?: string
  skillsPracticed?: string
  challengesFaced?: string
  hoursWorked?: number
  reportStatus?: "Draft" | "Submitted" | "Reviewed" | "Approved" | "Rejected"
  supervisorComments?: string
}

interface MonthlyReportFormProps {
  onSuccess: () => void;
  initialData?: MonthlyReportInitialData;
}

export function MonthlyReportForm({ onSuccess, initialData }: MonthlyReportFormProps) {
  const [loading, setLoading] = useState(false);
  const [learners, setLearners] = useState<Learner[]>([]);
const { authFetch } = useAuth();
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : Number(value))

  const normalizedReportStatus: MonthlyReportFormValues["reportStatus"] =
    initialData?.reportStatus === "Approved" || initialData?.reportStatus === "Rejected"
      ? "Reviewed"
      : initialData?.reportStatus || "Draft"

  const defaultValues: MonthlyReportFormValues = initialData ? {
    learner: typeof initialData.learner === 'object' && initialData.learner
      ? initialData.learner._id
      : initialData.learner || "",
    weekEnding: safeDateString(initialData.weekEnding) || new Date(),
    taskCompleted: initialData.taskCompleted || "",
    skillsPracticed: initialData.skillsPracticed || "",
    challengesFaced: initialData.challengesFaced || "",
    hoursWorked: initialData.hoursWorked ?? 0,
    reportStatus: normalizedReportStatus,
    supervisorComments: initialData.supervisorComments || "",
  } : {
    learner: "",
    weekEnding: new Date(),
    taskCompleted: "",
    skillsPracticed: "",
    challengesFaced: "",
    hoursWorked: 0,
    reportStatus: "Draft",
    supervisorComments: "",
  }
  
  const form = useForm<MonthlyReportFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)

  useEffect(() => {
    authFetch('/api/learners')
      .then(res => res.json())
      .then(data => setLearners(data))
      .catch(err => console.error("Error fetching learners:", err));
  }, [authFetch]);

  async function onSubmit(values: MonthlyReportFormValues) {
    setLoading(true);
    try {
      const url = initialData?._id ? `/api/monthly-reports/${initialData._id}` : '/api/monthly-reports';
      const response = await authFetch(url, {
        method: initialData?._id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error('Failed to save report');
      onSuccess();
    } catch (error) {
      console.error("Error submitting report:", error);
    } finally {
      setLoading(false);
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
             <FormField control={form.control} name="weekEnding" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-white">Report Date (Week Ending)</FormLabel>
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
            <FormField control={form.control} name="hoursWorked" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Total Hours Worked</FormLabel>
                  <FormControl><Input type="number" min="0" {...field} value={Number.isFinite(field.value) ? field.value : ""} onChange={e => field.onChange(normalizeNumberInput(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="taskCompleted" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Tasks Completed</FormLabel>
              <FormControl><Textarea placeholder="Detail the specific tasks and duties you completed..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="skillsPracticed" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Skills Practiced / Learned</FormLabel>
                  <FormControl><Textarea placeholder="What new skills did you apply or learn?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="challengesFaced" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Challenges Faced (Optional)</FormLabel>
                  <FormControl><Textarea placeholder="Did you encounter any difficulties?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="reportStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Report Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Submitted">Submitted</SelectItem>
                        <SelectItem value="Reviewed">Reviewed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="supervisorComments" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Supervisor Comments (Optional)</FormLabel>
                  <FormControl><Input placeholder="Feedback from supervisor..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData?._id ? "Update Report" : "Save Report"}
        </Button>
      </form>
    </Form>
  )
}
