import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { format } from "date-fns"
import { CalendarDays, Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import type { Learner } from "@/types/models"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/Calendar"
import { cn } from "@/lib/utils"
import { safeDateString } from "@/lib/dateUtils"
import { clearDraft, loadDraft, saveDraft } from "@/lib/offlineDrafts"

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  entryType: z.enum(["Daily", "Weekly"]),
  periodStart: z.date(),
  periodEnd: z.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Enter start time as HH:MM"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Enter end time as HH:MM"),
  hoursWorked: z.number().min(0, "Hours cannot be negative"),
  tasksCompleted: z.string().min(5, "Describe the work completed"),
  skillsDemonstrated: z.string().min(3, "Describe the skills demonstrated"),
  notes: z.string().optional(),
  learnerSignatureName: z.string().min(2, "Learner signature name is required"),
  facilitatorComment: z.string().optional(),
  facilitatorName: z.string().optional(),
  facilitatorSignatureName: z.string().optional(),
  facilitatorSignedAt: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface AttendanceLogFormProps {
  onSuccess: (result?: { offlineQueued?: boolean }) => void
  initialData?: {
    _id?: string
    status?: string
    updatedAt?: string
    learner?: string | { _id: string }
    entryType?: "Daily" | "Weekly"
    periodStart?: string
    periodEnd?: string
    startTime?: string
    endTime?: string
    hoursWorked?: number
    tasksCompleted?: string
    skillsDemonstrated?: string
    notes?: string
    learnerSignatureName?: string
    facilitatorComment?: string
    facilitatorName?: string
    facilitatorSignatureName?: string
    facilitatorSignedAt?: string
  } | null
  presetLearnerId?: string
}

export function AttendanceLogForm({ onSuccess, initialData, presetLearnerId }: AttendanceLogFormProps) {
  const { authFetch, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : Number(value))
  const draftKey = `draft:${user?._id || "anon"}:attendance-log:${initialData?._id || presetLearnerId || "new"}`

  const defaultLearner = useMemo(() => {
    if (typeof initialData?.learner === "object" && initialData.learner) {
      return initialData.learner._id
    }
    return initialData?.learner || presetLearnerId || ""
  }, [initialData, presetLearnerId])

  const isSignedOff = initialData?.status === "SignedOff"
  const isInstitutionalUser = user?.role !== "IndustryPartner"
  const isReviewMode = isSignedOff && isInstitutionalUser

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      learner: defaultLearner,
      entryType: initialData?.entryType || "Daily",
      periodStart: safeDateString(initialData?.periodStart) || new Date(),
      periodEnd: safeDateString(initialData?.periodEnd) || new Date(),
      startTime: initialData?.startTime || "08:00",
      endTime: initialData?.endTime || "17:00",
      hoursWorked: initialData?.hoursWorked || 0,
      tasksCompleted: initialData?.tasksCompleted || "",
      skillsDemonstrated: initialData?.skillsDemonstrated || "",
      notes: initialData?.notes || "",
      learnerSignatureName: initialData?.learnerSignatureName || "",
      facilitatorComment: initialData?.facilitatorComment || "",
      facilitatorName: initialData?.facilitatorName || (user?.role === "IndustryPartner" ? "" : (user?.name || "")),
      facilitatorSignatureName: initialData?.facilitatorSignatureName || (user?.role === "IndustryPartner" ? "" : (user?.name || "")),
      facilitatorSignedAt: initialData?.facilitatorSignedAt ? String(initialData.facilitatorSignedAt).slice(0, 10) : (user?.role === "IndustryPartner" ? "" : new Date().toISOString().slice(0, 10)),
    },
  })

  useEffect(() => {
    if (initialData?._id) return
    const draft = loadDraft<Record<string, string | number | null>>(draftKey)
    if (!draft) return

    form.reset({
      learner: typeof draft.learner === "string" ? draft.learner : defaultLearner,
      entryType: draft.entryType === "Weekly" ? "Weekly" : "Daily",
      periodStart: draft.periodStart ? new Date(String(draft.periodStart)) : new Date(),
      periodEnd: draft.periodEnd ? new Date(String(draft.periodEnd)) : new Date(),
      startTime: typeof draft.startTime === "string" ? draft.startTime : "08:00",
      endTime: typeof draft.endTime === "string" ? draft.endTime : "17:00",
      hoursWorked: typeof draft.hoursWorked === "number" ? draft.hoursWorked : 0,
      tasksCompleted: typeof draft.tasksCompleted === "string" ? draft.tasksCompleted : "",
      skillsDemonstrated: typeof draft.skillsDemonstrated === "string" ? draft.skillsDemonstrated : "",
      notes: typeof draft.notes === "string" ? draft.notes : "",
      learnerSignatureName: typeof draft.learnerSignatureName === "string" ? draft.learnerSignatureName : "",
      facilitatorComment: typeof draft.facilitatorComment === "string" ? draft.facilitatorComment : "",
      facilitatorName: typeof draft.facilitatorName === "string" ? draft.facilitatorName : (user?.role === "IndustryPartner" ? "" : (user?.name || "")),
      facilitatorSignatureName: typeof draft.facilitatorSignatureName === "string" ? draft.facilitatorSignatureName : (user?.role === "IndustryPartner" ? "" : (user?.name || "")),
      facilitatorSignedAt: typeof draft.facilitatorSignedAt === "string" ? draft.facilitatorSignedAt : (user?.role === "IndustryPartner" ? "" : new Date().toISOString().slice(0, 10)),
    })
  }, [defaultLearner, draftKey, form, initialData?._id, user?.name, user?.role])

  useEffect(() => {
    if (initialData?._id) return
    const subscription = form.watch((values) => {
      saveDraft(draftKey, {
        ...values,
        periodStart: values.periodStart instanceof Date ? values.periodStart.toISOString() : null,
        periodEnd: values.periodEnd instanceof Date ? values.periodEnd.toISOString() : null,
      })
    })
    return () => subscription.unsubscribe()
  }, [draftKey, form, initialData?._id])

  const entryType = form.watch("entryType")
  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find((learner) => learner._id === selectedLearnerId)

  useEffect(() => {
    if (!selectedLearner || initialData?._id) return
    if (!form.getValues("learnerSignatureName")) {
      form.setValue("learnerSignatureName", selectedLearner.name)
    }
  }, [form, initialData?._id, selectedLearner])

  useEffect(() => {
    const fetchLearners = async () => {
      try {
        if (user?.role === "IndustryPartner") {
          const res = await authFetch("/api/partner-portal/placements?status=Active")
          const data = await res.json()
          const partnerLearners = (data || [])
            .filter((placement: { assignedToCurrentSupervisor?: boolean; partnerSupervisor?: { _id: string } | null }) => {
              if (!placement.partnerSupervisor?._id) return true
              return placement.assignedToCurrentSupervisor
            })
            .map((placement: { learner?: Learner }) => placement.learner)
            .filter(Boolean)
          setLearners(partnerLearners)
          return
        }

        const res = await authFetch("/api/learners/options")
        const data = await res.json()
        setLearners(data)
      } catch (err) {
        console.error("Error fetching learners:", err)
      }
    }

    fetchLearners()
  }, [authFetch, user?.role])

  useEffect(() => {
    if (entryType === "Daily") {
      form.setValue("periodEnd", form.getValues("periodStart"))
    }
  }, [entryType, form])

  async function onSubmit(values: FormValues) {
    if (user?.role !== "IndustryPartner") {
      let hasError = false
      if (!values.facilitatorName || values.facilitatorName.trim().length < 2) {
        form.setError("facilitatorName", { type: "manual", message: "Facilitator name is required" })
        hasError = true
      }
      if (!values.facilitatorSignatureName || values.facilitatorSignatureName.trim().length < 2) {
        form.setError("facilitatorSignatureName", { type: "manual", message: "Facilitator signature name is required" })
        hasError = true
      }
      if (!values.facilitatorSignedAt || values.facilitatorSignedAt.trim().length < 1) {
        form.setError("facilitatorSignedAt", { type: "manual", message: "Facilitator signed date is required" })
        hasError = true
      }
      if (hasError) return
    }

    setLoading(true)
    try {
      const payload = {
        ...values,
        periodStart: values.periodStart.toISOString(),
        periodEnd: (values.entryType === "Daily" ? values.periodStart : values.periodEnd).toISOString(),
        ...(initialData?._id && initialData.updatedAt ? { clientUpdatedAt: initialData.updatedAt } : {}),
      }
      const url = initialData?._id ? `/api/attendance-logs/${initialData._id}` : "/api/attendance-logs"
      const method = initialData?._id ? "PUT" : "POST"
      const response = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to save attendance log" }))
        throw new Error(error.message || "Failed to save attendance log")
      }
      const data = await response.json().catch(() => ({}))
      clearDraft(draftKey)
      onSuccess(data)
    } catch (error) {
      console.error("Error submitting attendance log:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="learner"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Learner / Trainee</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={Boolean(initialData?.learner || presetLearnerId) || isReviewMode}
              >
                <FormControl>
                  <SelectTrigger className="bg-[#F5F5FA] border-transparent rounded-xl">
                    <SelectValue placeholder="Select a learner" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {learners.map((learner) => (
                    <SelectItem key={learner._id} value={learner._id}>
                      {learner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedLearner && (
          <div className="px-4 py-3 bg-[#F5F5FA] rounded-xl">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tracking ID</p>
            <p className="text-sm font-bold text-gray-900">{selectedLearner.trackingId || "N/A"}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="entryType"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">Entry Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isReviewMode}>
                  <FormControl>
                    <SelectTrigger className="bg-[#F5F5FA] border-transparent rounded-xl">
                      <SelectValue placeholder="Select entry type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Daily logs are single-day entries. Weekly logs can span up to 7 days.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hoursWorked"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">Hours Worked</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={isReviewMode}
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(e) => field.onChange(normalizeNumberInput(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">Start Time</FormLabel>
                <FormControl>
                  <Input type="time" value={field.value} onChange={field.onChange} disabled={isReviewMode} className="bg-[#F5F5FA] border-transparent rounded-xl" />
                </FormControl>
                <FormDescription>Capture the shift or reporting start time used in the logbook.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">End Time</FormLabel>
                <FormControl>
                  <Input type="time" value={field.value} onChange={field.onChange} disabled={isReviewMode} className="bg-[#F5F5FA] border-transparent rounded-xl" />
                </FormControl>
                <FormDescription>Capture the shift or reporting end time used in the logbook.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="periodStart"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-sm font-semibold text-gray-800">
                  {entryType === "Daily" ? "Date" : "Period Start"}
                </FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        disabled={isReviewMode}
                        className={cn(
                          "h-12 rounded-xl border-transparent bg-[#F5F5FA] text-gray-900 hover:bg-gray-100 text-left font-normal justify-start px-4",
                          !field.value && "text-gray-400"
                        )}
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border-gray-100" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date)
                        if (date && form.getValues("entryType") === "Daily") {
                          form.setValue("periodEnd", date)
                        }
                      }}
                      disabled={(date: Date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="periodEnd"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-sm font-semibold text-gray-800">
                  {entryType === "Daily" ? "Same Day" : "Period End"}
                </FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        disabled={entryType === "Daily" || isReviewMode}
                        className={cn(
                          "h-12 rounded-xl border-transparent bg-[#F5F5FA] text-gray-900 hover:bg-gray-100 text-left font-normal justify-start px-4",
                          !field.value && "text-gray-400"
                        )}
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white rounded-xl shadow-lg border-gray-100" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date: Date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
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
          name="tasksCompleted"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Tasks Completed</FormLabel>
              <FormControl>
                <Textarea placeholder="Summarize the work covered during this period..." {...field} disabled={isReviewMode} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="skillsDemonstrated"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Skills Demonstrated</FormLabel>
              <FormControl>
                <Textarea placeholder="List the practical, technical, or soft skills the learner demonstrated..." {...field} disabled={isReviewMode} />
              </FormControl>
              <FormDescription>This maps to the separate “Skills Demonstrated” field in the WEL logbook.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Remarks / Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional remarks about attendance, overtime, challenges, incidents, or follow-up actions." {...field} disabled={isReviewMode} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5 space-y-5">
          <div>
            <p className="text-sm font-black text-gray-900">Logbook Signatures & Review</p>
            <p className="text-sm text-gray-600 mt-1">These fields complete the learner and WEL facilitator section of the formal logbook.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField
              control={form.control}
              name="learnerSignatureName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Learner Signature Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Type learner full name as signature" {...field} className="bg-white border-gray-200 rounded-xl" disabled={isReviewMode} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {user?.role !== "IndustryPartner" && (
              <FormField
                control={form.control}
                name="facilitatorSignedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-800">Facilitator Review Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="bg-white border-gray-200 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {user?.role !== "IndustryPartner" && (
            <>
              <FormField
                control={form.control}
                name="facilitatorComment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-800">WEL Facilitator Comments</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Capture facilitator comments for the learner's weekly log..." {...field} className="bg-white border-gray-200 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="facilitatorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-800">WEL Facilitator Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Facilitator full name" {...field} className="bg-white border-gray-200 rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="facilitatorSignatureName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-800">Facilitator Signature Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Type facilitator name as signature" {...field} className="bg-white border-gray-200 rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}
        </div>

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isReviewMode ? "Submit Review & Countersign" : (initialData?._id ? "Update Attendance Log" : "Save Attendance Log")}
        </Button>
      </form>
    </Form>
  )
}
