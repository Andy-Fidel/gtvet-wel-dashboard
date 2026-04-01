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

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  entryType: z.enum(["Daily", "Weekly"]),
  periodStart: z.date(),
  periodEnd: z.date(),
  hoursWorked: z.number().min(0, "Hours cannot be negative"),
  tasksCompleted: z.string().min(5, "Describe the work completed"),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface AttendanceLogFormProps {
  onSuccess: () => void
  initialData?: {
    _id?: string
    learner?: string | { _id: string }
    entryType?: "Daily" | "Weekly"
    periodStart?: string
    periodEnd?: string
    hoursWorked?: number
    tasksCompleted?: string
    notes?: string
  } | null
  presetLearnerId?: string
}

export function AttendanceLogForm({ onSuccess, initialData, presetLearnerId }: AttendanceLogFormProps) {
  const { authFetch } = useAuth()
  const [loading, setLoading] = useState(false)
  const [learners, setLearners] = useState<Learner[]>([])
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : Number(value))

  const defaultLearner = useMemo(() => {
    if (typeof initialData?.learner === "object" && initialData.learner) {
      return initialData.learner._id
    }
    return initialData?.learner || presetLearnerId || ""
  }, [initialData, presetLearnerId])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      learner: defaultLearner,
      entryType: initialData?.entryType || "Daily",
      periodStart: safeDateString(initialData?.periodStart) || new Date(),
      periodEnd: safeDateString(initialData?.periodEnd) || new Date(),
      hoursWorked: initialData?.hoursWorked || 0,
      tasksCompleted: initialData?.tasksCompleted || "",
      notes: initialData?.notes || "",
    },
  })

  const entryType = form.watch("entryType")
  const selectedLearnerId = form.watch("learner")
  const selectedLearner = learners.find((learner) => learner._id === selectedLearnerId)

  useEffect(() => {
    authFetch("/api/learners")
      .then((res) => res.json())
      .then((data) => setLearners(data))
      .catch((err) => console.error("Error fetching learners:", err))
  }, [authFetch])

  useEffect(() => {
    if (entryType === "Daily") {
      form.setValue("periodEnd", form.getValues("periodStart"))
    }
  }, [entryType, form])

  async function onSubmit(values: FormValues) {
    setLoading(true)
    try {
      const payload = {
        ...values,
        periodStart: values.periodStart.toISOString(),
        periodEnd: (values.entryType === "Daily" ? values.periodStart : values.periodEnd).toISOString(),
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
      onSuccess()
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
                disabled={Boolean(initialData?.learner || presetLearnerId)}
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
                <Select value={field.value} onValueChange={field.onChange}>
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
                        disabled={entryType === "Daily"}
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
                <Textarea placeholder="Summarize the work covered during this period..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional notes about attendance, overtime, or issues encountered." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData?._id ? "Update Attendance Log" : "Save Attendance Log"}
        </Button>
      </form>
    </Form>
  )
}
