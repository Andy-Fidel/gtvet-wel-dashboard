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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { Loader2, CalendarDays, MapPin } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/Calendar"
import { safeDateString } from "@/lib/dateUtils"
import { INDUSTRY_SECTORS } from "@/lib/constants"

const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North"
].sort();

const formSchema = z.object({
  learner: z.string().min(2, { message: "Learner is required." }),
  companyName: z.string().min(2, { message: "Company Name is required." }),
  sector: z.string().min(1, { message: "Sector is required." }),
  location: z.string().min(1, { message: "Location is required." }),
  supervisorName: z.string().min(2, { message: "Supervisor Name is required." }),
  supervisorPhone: z.string().optional(),
  supervisorEmail: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  status: z.enum(["Active", "Completed", "Terminated"]),
  closureReason: z.string().optional(),
  closureNote: z.string().optional(),
  startDate: z.date(),
  endDate: z.date(),
}).superRefine((data, ctx) => {
  if (data.status !== "Active" && !data.closureReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Closure reason is required when closing a placement.",
      path: ["closureReason"],
    })
  }
})

type EditPlacementFormValues = z.infer<typeof formSchema>

interface EditPlacementFormProps {
    onSuccess: (data: unknown) => void;
    initialData: Omit<Partial<EditPlacementFormValues>, 'learner' | 'startDate' | 'endDate'> & { 
        _id: string;
        learner: string | { _id: string; name: string; trackingId: string };
        status?: "Active" | "Completed" | "Terminated";
        closureReason?: string;
        closureNote?: string;
        startDate?: string | Date;
        endDate?: string | Date;
    };
}

export function EditPlacementForm({ onSuccess, initialData }: EditPlacementFormProps) {
  const [loading, setLoading] = useState(false)
  const { authFetch } = useAuth()

  // GPS coordinates for the placement site
  const [coordLat, setCoordLat] = useState(initialData && (initialData as Record<string, unknown>).coordinates ? String(((initialData as Record<string, unknown>).coordinates as {lat?: number}).lat || '') : '')
  const [coordLng, setCoordLng] = useState(initialData && (initialData as Record<string, unknown>).coordinates ? String(((initialData as Record<string, unknown>).coordinates as {lng?: number}).lng || '') : '')
  const [placementRegion, setPlacementRegion] = useState((initialData as Record<string, unknown>)?.placementRegion as string || '')

  const form = useForm<EditPlacementFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        ...initialData,
        startDate: safeDateString(initialData.startDate),
        endDate: safeDateString(initialData.endDate),
        learner: (typeof initialData.learner === 'object' && initialData.learner !== null)
            ? (initialData.learner as { _id: string })._id
            : initialData.learner as string,
        status: initialData.status || "Active",
        closureReason: initialData.closureReason || "",
        closureNote: initialData.closureNote || "",
    },
  })

  const placementStatus = form.watch("status")

  async function onSubmit(values: EditPlacementFormValues) {
    setLoading(true)
    try {
        const url = `/api/placements/${initialData._id}`;
        const response = await authFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...values,
                closureReason: values.status === "Active" ? "" : values.closureReason?.trim() || "",
                closureNote: values.status === "Active" ? "" : values.closureNote?.trim() || "",
                ...(coordLat && coordLng ? { coordinates: { lat: parseFloat(coordLat), lng: parseFloat(coordLng) } } : {}),
                ...(placementRegion ? { placementRegion } : {}),
            }),
        })
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}))
            throw new Error(errData.message || 'Failed to save placement')
        }
        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to update placement")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        
        {/* Locked Learner Information */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F5F5FA] rounded-xl border border-gray-100">
            <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Learner Placement Profile</p>
                <p className="text-sm font-black text-indigo-900 mt-1">
                    {typeof initialData.learner === 'object' && initialData.learner !== null ? (initialData.learner as { name: string }).name : 'Learner'}
                </p>
                <p className="text-xs text-indigo-600 font-mono mt-0.5">
                    {typeof initialData.learner === 'object' && initialData.learner !== null ? (initialData.learner as { trackingId: string }).trackingId : 'Unknown Tracking ID'}
                </p>
            </div>
        </div>

        {/* Company & Sector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Company Name</FormLabel>
                  <FormControl><Input placeholder="Tech Solutions Ltd" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="sector" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Industry Sector</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {INDUSTRY_SECTORS.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Location & Supervisor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Location / Address</FormLabel>
                  <FormControl><Input placeholder="Company Location" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="supervisorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Supervisor Name</FormLabel>
                  <FormControl><Input placeholder="Full Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Supervisor Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField control={form.control} name="supervisorPhone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Supervisor Phone</FormLabel>
                <FormControl><Input placeholder="+233..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
          )} />
          <FormField control={form.control} name="supervisorEmail" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Supervisor Email</FormLabel>
                <FormControl><Input placeholder="supervisor@company.com" type="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 bg-[#F5F5FA] p-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Placement Lifecycle</p>
            <p className="text-sm text-gray-600 mt-1">Use this section to complete, terminate, or reopen the placement with an explicit closure reason.</p>
          </div>

          <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-900">Placement Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-transparent bg-white text-gray-900">
                      <SelectValue placeholder="Select placement status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
          )} />

          {placementStatus !== "Active" ? (
            <div className="grid grid-cols-1 gap-5">
              <FormField control={form.control} name="closureReason" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Closure Reason</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={placementStatus === "Completed" ? "Placement completed successfully" : "Reason for early termination"}
                        className="h-12 rounded-xl border-transparent bg-white text-gray-900"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
              )} />
              <FormField control={form.control} name="closureNote" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Closure Note</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add context, follow-up notes, or the specific completion/termination details for archive history."
                        className="min-h-[110px] rounded-xl border-transparent bg-white text-gray-900"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
              )} />
            </div>
          ) : (
            <p className="text-xs font-medium text-gray-500">
              Reopening a previously closed placement will clear stored closure metadata and return the learner to an active placement state.
            </p>
          )}
        </div>

        {/* GPS Coordinates (for visit verification) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Site GPS Coordinates <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setCoordLat(pos.coords.latitude.toFixed(6));
                    setCoordLng(pos.coords.longitude.toFixed(6));
                  });
                }
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline"
            >
              Use my location
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Latitude (e.g. 7.3362)"
              value={coordLat}
              onChange={(e) => setCoordLat(e.target.value)}
              className="h-12 rounded-xl border-transparent bg-[#F5F5FA] px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <input
              type="text"
              placeholder="Longitude (e.g. -2.3268)"
              value={coordLng}
              onChange={(e) => setCoordLng(e.target.value)}
              className="h-12 rounded-xl border-transparent bg-[#F5F5FA] px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-medium">Used to verify monitoring visit locations. Click &ldquo;Use my location&rdquo; if you&apos;re at the placement site.</p>
        </div>

         {/* Placement Region (for cross-region delegation) */}
         <div className="space-y-2">
           <label className="text-sm font-semibold text-gray-900">Placement Region</label>
           <Select value={placementRegion} onValueChange={setPlacementRegion}>
             <SelectTrigger className="h-12 rounded-xl border-transparent bg-[#F5F5FA] text-gray-900">
               <SelectValue placeholder="Select region where placement is located" />
             </SelectTrigger>
             <SelectContent className="max-h-60">
               {GHANA_REGIONS.map(r => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
             </SelectContent>
           </Select>
           <p className="text-[10px] text-gray-400 font-medium">Required for assigning a cross-region delegate supervisor.</p>
         </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-gray-900">Start Date</FormLabel>
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
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date: Date) => date < new Date("1900-01-01")} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
             )} />
             <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-gray-900">End Date</FormLabel>
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
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date: Date) => date < new Date("1900-01-01")} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
             )} />
        </div>

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Placement
        </Button>
      </form>
    </Form>
  )
}
