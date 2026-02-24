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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState, useEffect } from "react"
import { Loader2, CalendarDays, ArrowUpRight, CheckCircle2, AlertCircle, Hash } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/Calendar"
import { safeDateString } from "@/lib/dateUtils"

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  visitDate: z.date(),
  visitType: z.enum(["Routine", "Emergency", "Follow-up"]),
  attendanceStatus: z.enum(["Present", "Absent", "Excused", "Late"]),
  performanceRating: z.number().min(1).max(5).int(),
  issuesIdentified: z.string().optional(),
  actionTaken: z.string().optional(),
  nextSteps: z.string().optional(),
})

type MonitoringVisitFormValues = z.infer<typeof formSchema>

interface MonitoringVisitFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: any;
}

export function MonitoringVisitForm({ onSuccess, initialData }: MonitoringVisitFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<any[]>([])
  const { authFetch } = useAuth()

  useEffect(() => {
    authFetch('http://localhost:5001/api/learners')
        .then(res => res.json())
        .then(data => setLearners(data))
        .catch(err => console.error("Error fetching learners:", err))
  }, [authFetch])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: (initialData ? {
        ...initialData,
        visitDate: safeDateString(initialData.visitDate),
        learner: initialData.learner?._id || initialData.learner,
    } : {
      learner: "",
      visitType: 'Routine',
      visitDate: new Date(),
      attendanceStatus: 'Present',
      performanceRating: 3,
    }) as MonitoringVisitFormValues,
  })

  // Watch the selected learner ID to find the full learner object
  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)

  async function onSubmit(values: MonitoringVisitFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id 
            ? `http://localhost:5001/api/monitoring-visits/${initialData._id}`
            : 'http://localhost:5001/api/monitoring-visits';
        
        const method = initialData?._id ? 'PUT' : 'POST';

        const response = await authFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            throw new Error('Failed to save visit')
        }

        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
    } finally {
        setLoading(false)
    }
  }

  return (
    <div className="bg-[#121212]/30 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Learner Selection */}
        <FormField
          control={form.control}
          name="learner"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Learner / Trainee</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-blue-500/50 hover:bg-white/10 transition-colors pl-6">
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
                <Hash className="w-5 h-5 text-blue-400" />
                <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Tracking ID</p>
                    <p className="text-sm font-black text-white">{selectedLearner.trackingId || 'N/A'}</p>
                </div>
            </div>
        )}

        {/* Date and Type Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="visitDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel className="text-white ml-2">Visit Date</FormLabel>
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
                name="visitType"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Visit Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-blue-500/50 hover:bg-white/10 transition-colors pl-6">
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                            <SelectItem value="Routine" className="rounded-xl">Routine</SelectItem>
                            <SelectItem value="Emergency" className="rounded-xl">Emergency</SelectItem>
                            <SelectItem value="Follow-up" className="rounded-xl">Follow-up</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        {/* Status and Rating Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="attendanceStatus"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Attendance Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-blue-500/50 hover:bg-white/10 transition-colors pl-6">
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                            <SelectItem value="Present" className="rounded-xl text-emerald-400">Present</SelectItem>
                            <SelectItem value="Absent" className="rounded-xl text-red-400">Absent</SelectItem>
                            <SelectItem value="Excused" className="rounded-xl text-amber-400">Excused</SelectItem>
                            <SelectItem value="Late" className="rounded-xl text-blue-400">Late</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="performanceRating"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Performance Rating (1-5)</FormLabel>
                    <FormControl>
                        <div className="relative flex items-center bg-white/5 border border-white/20 rounded-full h-12 px-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                           <input 
                              type="range" 
                              min="1" 
                              max="5" 
                              step="1"
                              value={field.value}
                              onChange={e => field.onChange(Number(e.target.value))}
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 mx-4"
                           />
                           <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-black text-sm shrink-0">
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
            name="issuesIdentified"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Issues / Challenges Identified</FormLabel>
                <FormControl>
                    <div className="relative">
                      <AlertCircle className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                      <textarea 
                        className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all outline-none resize-y" 
                        placeholder="Describe any issues observed during the visit..." 
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
                name="actionTaken"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Immediate Action Taken</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <CheckCircle2 className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="Actions immediately taken..." 
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
                name="nextSteps"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Agreed Next Steps</FormLabel>
                    <FormControl>
                        <div className="relative">
                        <ArrowUpRight className="absolute left-6 top-4 h-5 w-5 text-white/40" />
                        <textarea 
                            className="w-full min-h-[100px] bg-white/5 border border-white/20 rounded-2xl p-4 pl-14 text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all outline-none resize-y" 
                            placeholder="Steps for continuous improvement..." 
                            {...field} 
                        />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <Button 
            type="submit" 
            className="w-full h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] border border-blue-500/50" 
            disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {initialData?._id ? "Update Visit Record" : "Save Visit Record"}
        </Button>
      </form>
    </Form>
    </div>
  )
}
