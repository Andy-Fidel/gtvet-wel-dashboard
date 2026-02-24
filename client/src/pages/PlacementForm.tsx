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
import { Loader2, MapPin, User, CalendarDays, Briefcase, Mail, Hash } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/Calendar"
import { safeDateString } from "@/lib/dateUtils"

const formSchema = z.object({
  learner: z.string().min(2, { message: "Learner is required." }),
  companyName: z.string().min(2, { message: "Company Name is required." }),
  sector: z.string().min(1, { message: "Sector is required." }),
  location: z.string().min(1, { message: "Location is required." }),
  supervisorName: z.string().min(2, { message: "Supervisor Name is required." }),
  supervisorEmail: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  status: z.enum(["Active", "Completed", "Terminated"]),
  startDate: z.date(),
  endDate: z.date(),
})

type PlacementFormValues = z.infer<typeof formSchema>

interface PlacementFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: any;
}

export function PlacementForm({ onSuccess, initialData }: PlacementFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<any[]>([])
  const { authFetch } = useAuth()

  useEffect(() => {
    authFetch('http://localhost:5001/api/learners')
        .then(res => res.json())
        .then(data => setLearners(data))
        .catch(err => console.error("Error fetching learners:", err))
  }, [authFetch])

  const form = useForm<PlacementFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        startDate: safeDateString(initialData.startDate),
        endDate: safeDateString(initialData.endDate),
        learner: initialData.learner?._id || initialData.learner,
    } : {
      learner: "",
      companyName: "",
      sector: "",
      location: "",
      supervisorName: "",
      supervisorEmail: "",
      status: "Active",
      startDate: new Date(),
      endDate: new Date(),
    },
  })

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)

    async function onSubmit(values: PlacementFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id 
            ? `http://localhost:5001/api/placements/${initialData._id}`
            : 'http://localhost:5001/api/placements';
        
        const method = initialData?._id ? 'PUT' : 'POST';

        const response = await authFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            throw new Error('Failed to save placement')
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
        <FormField
          control={form.control}
          name="learner"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Learner / Trainee</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-emerald-500/50 hover:bg-white/10 transition-colors">
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
                <Hash className="w-5 h-5 text-emerald-400" />
                <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Tracking ID</p>
                    <p className="text-sm font-black text-white">{selectedLearner.trackingId || 'N/A'}</p>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Company Name</FormLabel>
                <FormControl>
                    <div className="relative">
                      <Briefcase className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="Tech Solutions Ltd" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
             <FormField
            control={form.control}
            name="sector"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Industry Sector</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-emerald-500/50 hover:bg-white/10 transition-colors pl-6">
                        <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                        <SelectItem value="Information Technology" className="rounded-xl">Information Technology</SelectItem>
                        <SelectItem value="Manufacturing" className="rounded-xl">Manufacturing</SelectItem>
                        <SelectItem value="Agriculture" className="rounded-xl">Agriculture</SelectItem>
                        <SelectItem value="Construction" className="rounded-xl">Construction</SelectItem>
                        <SelectItem value="Healthcare" className="rounded-xl">Healthcare</SelectItem>
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
            name="location"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Location/Address</FormLabel>
                <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="Company Location" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="supervisorName"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Supervisor Name</FormLabel>
                <FormControl>
                    <div className="relative">
                      <User className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="Supervisor Name" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <FormField
            control={form.control}
            name="supervisorEmail"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Supervisor Email</FormLabel>
                <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="supervisor@company.com" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel className="text-white ml-2">Start Date</FormLabel>
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
                            date < new Date("1900-01-01")
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
                name="endDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel className="text-white ml-2">End Date</FormLabel>
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
                            date < new Date("1900-01-01")
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
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-full border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:ring-emerald-500/50 hover:bg-white/10 transition-colors pl-6">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white rounded-2xl">
                  <SelectItem value="Active" className="rounded-xl">Active</SelectItem>
                  <SelectItem value="Completed" className="rounded-xl text-emerald-400">Completed</SelectItem>
                  <SelectItem value="Terminated" className="rounded-xl text-red-400">Terminated</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button 
            type="submit" 
            className="w-full h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] border border-emerald-400/50" 
            disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {initialData?._id ? "Update Placement" : "Save Placement"}
        </Button>
      </form>
    </Form>
    </div>
  )
}
