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
import { Loader2, CalendarDays, Award, Star, ListChecks, Target, HeartHandshake, User, ArrowUpRight, Hash } from "lucide-react"
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

interface Learner {
  _id: string;
  name: string;
  trackingId: string;
}

interface CompetencyAssessmentFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: any;
}

export function CompetencyAssessmentForm({ onSuccess, initialData }: CompetencyAssessmentFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const { authFetch } = useAuth()

  useEffect(() => {
    authFetch('http://localhost:5001/api/learners')
        .then(res => res.json())
        .then(data => setLearners(data))
        .catch(err => console.error("Error fetching learners:", err))
  }, [authFetch])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        learner: typeof initialData.learner === 'object' ? initialData.learner._id : initialData.learner,
        assessmentDate: safeDateString(initialData.assessmentDate),
        assessmentType: initialData.assessmentType,
        technicalSkills: initialData.technicalSkills,
        softSkills: initialData.softSkills,
        professionalism: initialData.professionalism,
        problemSolving: initialData.problemSolving,
        overallScore: initialData.overallScore,
        assessorName: initialData.assessorName,
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
        const url = initialData?._id 
            ? `http://localhost:5001/api/assessments/${initialData._id}`
            : 'http://localhost:5001/api/assessments';
        
        const method = initialData?._id ? 'PUT' : 'POST';

        const response = await authFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            throw new Error('Failed to save assessment')
        }

        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error("Error submitting assessment:", error)
    } finally {
        setLoading(false)
    }
  }

  return (
    <div className="bg-[#121212]/30 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <FormField
          control={form.control}
          name="learner"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Learner / Trainee</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-amber-500/50 hover:bg-white/10 transition-colors pl-6">
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
                <Hash className="w-5 h-5 text-amber-400" />
                <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Tracking ID</p>
                    <p className="text-sm font-black text-white">{selectedLearner.trackingId || 'N/A'}</p>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="assessmentDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel className="text-white ml-2">Assessment Date</FormLabel>
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
                name="assessmentType"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Assessment Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-amber-500/50 hover:bg-white/10 transition-colors pl-6">
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                            <SelectItem value="Practical" className="rounded-xl">Practical</SelectItem>
                            <SelectItem value="Theoretical" className="rounded-xl">Theoretical</SelectItem>
                            <SelectItem value="Combined" className="rounded-xl">Combined</SelectItem>
                            <SelectItem value="On-the-job" className="rounded-xl">On-the-job</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="assessorName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Assessor Name</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <User className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                        <Input placeholder="Full Name" className="pl-14 h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-amber-500/50" {...field} />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
             <FormField
                control={form.control}
                name="overallScore"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Overall Score (0-100)</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <Award className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-amber-400" />
                        <Input type="number" className="pl-14 h-12 rounded-full border-white/20 bg-white/5 text-amber-400 font-bold text-lg placeholder:text-white/40 focus:ring-amber-500/50" min="0" max="100" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="technicalSkills"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Technical Skills Demonstrated</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <ListChecks className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="Describe technical competencies..." 
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
                name="softSkills"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Soft Skills Demonstrated</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <HeartHandshake className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="Describe communication, teamwork, etc..." 
                            {...field} 
                        />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="professionalism"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Professionalism Rating (1-5)</FormLabel>
                    <FormControl>
                        <div className="relative flex items-center bg-white/5 border border-white/20 rounded-full h-12 px-2 focus-within:ring-2 focus-within:ring-amber-500/50 transition-all">
                           <Star className="ml-4 h-5 w-5 text-amber-400" />
                           <input 
                              type="range" 
                              min="1" 
                              max="5" 
                              step="1"
                              value={field.value}
                              onChange={e => field.onChange(Number(e.target.value))}
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500 mx-4"
                           />
                           <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-black text-sm shrink-0">
                               {field.value}
                           </span>
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
             <FormField
                control={form.control}
                name="problemSolving"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Problem Solving Rating (1-5)</FormLabel>
                    <FormControl>
                        <div className="relative flex items-center bg-white/5 border border-white/20 rounded-full h-12 px-2 focus-within:ring-2 focus-within:ring-amber-500/50 transition-all">
                           <Target className="ml-4 h-5 w-5 text-amber-400" />
                           <input 
                              type="range" 
                              min="1" 
                              max="5" 
                              step="1"
                              value={field.value}
                              onChange={e => field.onChange(Number(e.target.value))}
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500 mx-4"
                           />
                           <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-black text-sm shrink-0">
                               {field.value}
                           </span>
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <FormField
            control={form.control}
            name="recommendations"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Recommendations for Future Development</FormLabel>
                <FormControl>
                    <div className="relative">
                    <ArrowUpRight className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                    <textarea 
                        className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all outline-none resize-y" 
                        placeholder="What should the learner focus on improving?" 
                        {...field} 
                    />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
        />

        <Button 
            type="submit" 
            className="w-full h-14 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-lg transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] border border-amber-400/50" 
            disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {initialData?._id ? "Update Competency Assessment" : "Save Competency Assessment"}
        </Button>
      </form>
    </Form>
    </div>
  )
}
