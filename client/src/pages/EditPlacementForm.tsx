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
import { useState } from "react"
import { Loader2, CalendarDays, MapPin } from "lucide-react"
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
  startDate: z.date(),
  endDate: z.date(),
})

type EditPlacementFormValues = z.infer<typeof formSchema>

interface EditPlacementFormProps {
    onSuccess: (data: unknown) => void;
    initialData: Omit<Partial<EditPlacementFormValues>, 'learner' | 'startDate' | 'endDate'> & { 
        _id: string;
        learner: string | { _id: string; name: string; trackingId: string };
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

  const form = useForm<EditPlacementFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        ...initialData,
        startDate: safeDateString(initialData.startDate),
        endDate: safeDateString(initialData.endDate),
        learner: (typeof initialData.learner === 'object' && initialData.learner !== null)
            ? (initialData.learner as { _id: string })._id
            : initialData.learner as string,
    },
  })

  async function onSubmit(values: EditPlacementFormValues) {
    setLoading(true)
    try {
        const url = `/api/placements/${initialData._id}`;
        const response = await authFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...values,
                ...(coordLat && coordLng ? { coordinates: { lat: parseFloat(coordLat), lng: parseFloat(coordLng) } } : {}),
            }),
        })
        if (!response.ok) throw new Error('Failed to save placement')
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
                  <FormLabel className="text-sm font-semibold text-white">Company Name</FormLabel>
                  <FormControl><Input placeholder="Tech Solutions Ltd" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="sector" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Industry Sector</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Information Technology">Information Technology</SelectItem>
                        <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="Agriculture">Agriculture</SelectItem>
                        <SelectItem value="Construction">Construction</SelectItem>
                        <SelectItem value="Healthcare">Healthcare</SelectItem>
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
                  <FormLabel className="text-sm font-semibold text-white">Location / Address</FormLabel>
                  <FormControl><Input placeholder="Company Location" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="supervisorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Supervisor Name</FormLabel>
                  <FormControl><Input placeholder="Full Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* Supervisor Email */}
        <FormField control={form.control} name="supervisorEmail" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Supervisor Email</FormLabel>
              <FormControl><Input placeholder="supervisor@company.com" type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        {/* GPS Coordinates (for visit verification) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-white flex items-center gap-1.5">
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

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-semibold text-white">Start Date</FormLabel>
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
                  <FormLabel className="text-sm font-semibold text-white">End Date</FormLabel>
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
