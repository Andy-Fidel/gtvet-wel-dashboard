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
import { Loader2, CalendarDays, BookOpen, Wrench, AlertTriangle, Clock, Hash } from "lucide-react"
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

interface Learner {
  _id: string;
  name: string;
  trackingId: string;
}

interface MonthlyReportFormProps {
  onSuccess: () => void;
  initialData?: any;
}

export function MonthlyReportForm({ onSuccess, initialData }: MonthlyReportFormProps) {
  const [loading, setLoading] = useState(false);
  const [learners, setLearners] = useState<Learner[]>([]);
  const { authFetch } = useAuth();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      learner: (typeof initialData.learner === 'object' ? initialData.learner?._id : initialData.learner) || "",
      weekEnding: safeDateString(initialData.weekEnding),
      taskCompleted: initialData.taskCompleted || "",
      skillsPracticed: initialData.skillsPracticed || "",
      challengesFaced: initialData.challengesFaced || "",
      hoursWorked: initialData.hoursWorked || 0,
      reportStatus: initialData.reportStatus || "Draft",
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
    },
  });

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)

  useEffect(() => {
    authFetch('http://localhost:5001/api/learners')
      .then(res => res.json())
      .then(data => setLearners(data))
      .catch(err => console.error("Error fetching learners:", err));
  }, [authFetch]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const url = initialData?._id
        ? `http://localhost:5001/api/monthly-reports/${initialData._id}`
        : 'http://localhost:5001/api/monthly-reports';

      const method = initialData?._id ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save report');
      }

      onSuccess();
    } catch (error) {
      console.error("Error submitting report:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#121212]/30 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Learner ID Row */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="learner"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white ml-2">Learner / Trainee</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-purple-500/50 hover:bg-white/10 transition-colors pl-6">
                      <SelectValue placeholder="Select a learner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                    {learners.map((learner) => (
                      <SelectItem key={learner._id} value={learner._id} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer rounded-xl my-1 transition-colors">
                        {learner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tracking ID Display (Read-only) */}
          {selectedLearner && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl">
                <Hash className="w-5 h-5 text-purple-400" />
                <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Tracking ID</p>
                    <p className="text-sm font-black text-white">{selectedLearner.trackingId || 'N/A'}</p>
                </div>
            </div>
          )}
        </div>

        {/* Date and Hours Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="weekEnding"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel className="text-white ml-2">Report Date (Week Ending)</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "pl-6 h-12 rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 text-left font-normal",
                                !field.value && "text-white/40"
                            )}
                            >
                            <div className="flex items-center">
                              <CalendarDays className="mr-3 h-5 w-5 text-white/40" />
                              {field.value ? (
                                  format(field.value, "PPP")
                              ) : (
                                  <span>Pick a date</span>
                              )}
                            </div>
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-black/80 backdrop-blur-xl border-white/20 rounded-[2rem] shadow-2xl overflow-hidden" align="start">
                        <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date: Date) =>
                            date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                            className="text-white"
                        />
                        </PopoverContent>
                    </Popover>
                    <FormMessage />
                    </FormItem>
                )}
            />
             <FormField
                control={form.control}
                name="hoursWorked"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Total Hours Worked</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <Clock className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                        <Input type="number" className="pl-14 h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-purple-500/50" min="0" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        {/* Core Content - Textareas */}
        <FormField
            control={form.control}
            name="taskCompleted"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Tasks Completed</FormLabel>
                <FormControl>
                    <div className="relative">
                      <BookOpen className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                      <textarea 
                        className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all outline-none resize-y" 
                        placeholder="Detail the specific tasks and duties you completed this period..." 
                        {...field} 
                      />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="skillsPracticed"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Skills Practiced / Learned</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <Wrench className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="What new skills did you apply or learn?" 
                            {...field} 
                        />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="challengesFaced"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Challenges Faced (Optional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <AlertTriangle className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="Did you encounter any difficulties?" 
                            {...field} 
                        />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        {/* Status and Supervisor Comments Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <FormField
            control={form.control}
            name="reportStatus"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Report Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-purple-500/50 hover:bg-white/10 transition-colors pl-6">
                        <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                    <SelectItem value="Draft" className="rounded-xl">Draft</SelectItem>
                    <SelectItem value="Submitted" className="rounded-xl text-blue-400">Submitted</SelectItem>
                    <SelectItem value="Reviewed" className="rounded-xl text-emerald-400">Reviewed</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
                control={form.control}
                name="supervisorComments"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Supervisor Comments (Optional)</FormLabel>
                    <FormControl>
                        <Input 
                            className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-purple-500/50 px-6" 
                            placeholder="Feedback from supervisor..." 
                            {...field} 
                        />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <Button 
            type="submit" 
            className="w-full h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] border border-purple-500/50" 
            disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {initialData?._id ? "Update Report" : "Save Report"}
        </Button>
      </form>
    </Form>
    </div>
  )
}
