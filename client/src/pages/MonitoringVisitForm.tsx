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
import { Loader2, CalendarDays, MapPin, MapPinOff, Handshake } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/Calendar"
import { safeDateString } from "@/lib/dateUtils"
import { clearDraft, loadDraft, saveDraft } from "@/lib/offlineDrafts"
import { toast } from "sonner"

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  visitDate: z.date(),
  visitType: z.enum(["Routine", "Urgent", "Emergency", "Follow-up"]),
  attendanceStatus: z.enum(["Present", "Absent", "Excused", "Late"]),
  performanceRating: z.number().min(1).max(5).int(),
  keyObservations: z.string().optional(),
  issuesIdentified: z.string().optional(),
  actionRequired: z.string().optional(),
  gpsExceptionReason: z.string().optional(),
})

type MonitoringVisitFormValues = z.infer<typeof formSchema>

interface MonitoringVisitFormProps {
    onSuccess: (data?: { offlineQueued?: boolean }) => void;
    initialData?: Partial<MonitoringVisitFormValues> & { 
        _id?: string;
        updatedAt?: string;
        learner?: string | { _id: string; name: string; trackingId: string };
    };
}

export function MonitoringVisitForm({ onSuccess, initialData }: MonitoringVisitFormProps) {
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const { authFetch, user } = useAuth()

  // GPS capture state
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'captured' | 'denied' | 'unavailable'>('acquiring')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const draftKey = `draft:monitoring-visit:${initialData?._id || "new"}`

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
    authFetch('/api/learners/options')
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
      keyObservations: "",
      issuesIdentified: "",
      actionRequired: "",
      gpsExceptionReason: "",
    },
  })

  useEffect(() => {
    if (initialData?._id) return
    const draft = loadDraft<Record<string, string | number | null>>(draftKey)
    if (!draft) return

    form.reset({
      learner: typeof draft.learner === "string" ? draft.learner : "",
      visitType: draft.visitType === "Urgent" || draft.visitType === "Emergency" || draft.visitType === "Follow-up" ? draft.visitType : "Routine",
      visitDate: draft.visitDate ? new Date(String(draft.visitDate)) : new Date(),
      attendanceStatus: draft.attendanceStatus === "Absent" || draft.attendanceStatus === "Excused" || draft.attendanceStatus === "Late" ? draft.attendanceStatus : "Present",
      performanceRating: typeof draft.performanceRating === "number" ? draft.performanceRating : 3,
      keyObservations: typeof draft.keyObservations === "string" ? draft.keyObservations : "",
      issuesIdentified: typeof draft.issuesIdentified === "string" ? draft.issuesIdentified : "",
      actionRequired: typeof draft.actionRequired === "string" ? draft.actionRequired : "",
      gpsExceptionReason: typeof draft.gpsExceptionReason === "string" ? draft.gpsExceptionReason : "",
    })
  }, [draftKey, form, initialData?._id])

  useEffect(() => {
    if (initialData?._id) return
    const subscription = form.watch((values) => {
      saveDraft(draftKey, {
        ...values,
        visitDate: values.visitDate instanceof Date ? values.visitDate.toISOString() : null,
      })
    })
    return () => subscription.unsubscribe()
  }, [draftKey, form, initialData?._id])

  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find(l => l._id === selectedLearnerId)
  const normalizeSliderValue = (value: number) => (Number.isFinite(value) ? value : 1)

  async function onSubmit(values: MonitoringVisitFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/monitoring-visits/${initialData._id}` : '/api/monitoring-visits';
        if (!initialData?._id && gpsStatus !== 'captured' && !values.gpsExceptionReason?.trim()) {
            form.setError("gpsExceptionReason", { type: "manual", message: "Explain why GPS verification failed before saving this visit." })
            setLoading(false)
            return
        }
        const payload = {
            ...values,
            ...(initialData?._id && initialData.updatedAt ? { clientUpdatedAt: initialData.updatedAt } : {}),
            ...(gpsCoords && !initialData?._id ? { submittedLocation: gpsCoords } : {}),
        };
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null)
            throw new Error(errorPayload?.message || 'Failed to save visit')
        }
        const data = await response.json()
        clearDraft(draftKey)
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save visit")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 text-gray-900">
        
        {/* Learner */}
        <FormField control={form.control} name="learner" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Learner / Trainee</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData?.learner}>
                <FormControl><SelectTrigger className="bg-[#F5F5FA] text-gray-900"><SelectValue placeholder="Select a learner" /></SelectTrigger></FormControl>
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

        {/* Delegation Banner */}
        {selectedLearner && user?.institution && selectedLearner.region !== undefined && (
          (() => {
            // Check if learner belongs to a different institution (delegate scenario)
            const learnerInst = (selectedLearner as any).institution;
            if (learnerInst && learnerInst !== user.institution) {
              return (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 rounded-xl border border-amber-200">
                  <Handshake className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Delegated Visit</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      You are logging this visit as a delegate on behalf of <strong>{learnerInst}</strong>. 
                      The originating officer will be notified.
                    </p>
                  </div>
                </div>
              );
            }
            return null;
          })()
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Visit Date</FormLabel>
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Visit Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="bg-[#F5F5FA] text-gray-900"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Routine">Routine</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Attendance Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="bg-[#F5F5FA] text-gray-900"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
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
                  <FormLabel className="text-sm font-semibold text-gray-900">Performance Rating (1-5)</FormLabel>
                  <FormControl>
                    <div className="flex items-center bg-[#F5F5FA] rounded-xl h-12 px-3 text-gray-900">
                       <input type="range" min="1" max="5" step="1" value={normalizeSliderValue(field.value)} onChange={e => field.onChange(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-indigo-500 mx-2" />
                       <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">{field.value}</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Textareas */}
        <FormField control={form.control} name="keyObservations" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Key Observations</FormLabel>
              <FormControl><Textarea placeholder="Describe what you observed during the visit..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <FormField control={form.control} name="issuesIdentified" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Issues / Challenges Identified</FormLabel>
              <FormControl><Textarea placeholder="Describe any issues observed during the visit..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="actionRequired" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Action Required / Taken</FormLabel>
                  <FormControl><Textarea placeholder="Actions taken during the visit or follow-up now required..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="gpsExceptionReason" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">GPS Exception Reason</FormLabel>
                  <FormControl><Textarea placeholder="Required if GPS is denied, unavailable, too far from site, or no placement coordinates exist." {...field} /></FormControl>
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
