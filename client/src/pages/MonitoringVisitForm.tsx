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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useState, useEffect, useCallback } from "react"
import { Loader2, CalendarDays, MapPin, MapPinOff } from "lucide-react"
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
    initialData?: Partial<MonitoringVisitFormValues> & { 
        _id?: string;
        learner?: string | { _id: string; name: string; trackingId: string };
    };
}

export function MonitoringVisitForm({ onSuccess, initialData }: MonitoringVisitFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const { authFetch } = useAuth()

  // GPS capture state
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'captured' | 'denied' | 'unavailable'>('acquiring')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)

  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsStatus('captured');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => { captureLocation(); }, [captureLocation]);

  useEffect(() => {
    authFetch('/api/learners')
        .then(res => res.json())
        .then(data => setLearners(data))
        .catch(err => console.error("Error fetching learners:", err))
  }, [authFetch])

  const form = useForm<MonitoringVisitFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        visitDate: safeDateString(initialData.visitDate),
        learner: (typeof initialData.learner === 'object' && initialData.learner)
            ? (initialData.learner as { _id: string })._id
            : (initialData.learner as string) || "",
    } : {
      learner: "",
      visitType: 'Routine',
      visitDate: new Date(),
      attendanceStatus: 'Present',
      performanceRating: 3,
    },
  })

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)
  const normalizeSliderValue = (value: number) => (Number.isFinite(value) ? value : 1)

  async function onSubmit(values: MonitoringVisitFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/monitoring-visits/${initialData._id}` : '/api/monitoring-visits';
        const payload = {
            ...values,
            ...(gpsCoords && !initialData?._id ? { submittedLocation: gpsCoords } : {}),
        };
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error('Failed to save visit')
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
        
        {/* Learner */}
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

        {/* GPS Status Indicator */}
        {!initialData?._id && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
            gpsStatus === 'captured' ? 'bg-emerald-50 text-emerald-700' :
            gpsStatus === 'acquiring' ? 'bg-blue-50 text-blue-700' :
            'bg-amber-50 text-amber-700'
          }`}>
            {gpsStatus === 'captured' && <><MapPin className="h-3.5 w-3.5" /> Location captured ({gpsCoords?.accuracy?.toFixed(0)}m accuracy)</>}
            {gpsStatus === 'acquiring' && <><MapPin className="h-3.5 w-3.5 animate-pulse" /> Acquiring location...</>}
            {gpsStatus === 'denied' && <><MapPinOff className="h-3.5 w-3.5" /> Location denied — visit will be flagged</>}
            {gpsStatus === 'unavailable' && <><MapPinOff className="h-3.5 w-3.5" /> GPS unavailable</>}
            {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
              <button type="button" onClick={captureLocation} className="ml-auto underline text-xs">Retry</button>
            )}
          </div>
        )}

        {/* Date and Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="visitDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-white">Visit Date</FormLabel>
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
            <FormField control={form.control} name="visitType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Visit Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Routine">Routine</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Status and Rating */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="attendanceStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Attendance Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Present">Present</SelectItem>
                        <SelectItem value="Absent">Absent</SelectItem>
                        <SelectItem value="Excused">Excused</SelectItem>
                        <SelectItem value="Late">Late</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
             )} />

            <FormField control={form.control} name="performanceRating" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Performance Rating (1-5)</FormLabel>
                  <FormControl>
                    <div className="flex items-center bg-[#F5F5FA] rounded-xl h-12 px-3">
                       <input type="range" min="1" max="5" step="1" value={normalizeSliderValue(field.value)} onChange={e => field.onChange(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-indigo-500 mx-2" />
                       <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">{field.value}</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Textareas */}
        <FormField control={form.control} name="issuesIdentified" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Issues / Challenges Identified</FormLabel>
              <FormControl><Textarea placeholder="Describe any issues observed during the visit..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="actionTaken" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Immediate Action Taken</FormLabel>
                  <FormControl><Textarea placeholder="Actions immediately taken..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="nextSteps" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Agreed Next Steps</FormLabel>
                  <FormControl><Textarea placeholder="Steps for continuous improvement..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData?._id ? "Update Visit Record" : "Save Visit Record"}
        </Button>
      </form>
    </Form>
  )
}
