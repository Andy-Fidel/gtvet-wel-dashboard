
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "@/lib/toast"

const formSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  code: z.string().trim().min(2, "Code is required"),
  district: z.string().trim().min(2, "District is required"),
  region: z.string().trim().min(1, "Region is required"),
  location: z.string().trim().min(2, "Location is required"),
  category: z.enum(["A", "B", "C"]),
  status: z.enum(["Day", "Boarding", "Day/Boarding"]),
  gender: z.enum(["Boys", "Girls", "Mixed"]),
  calendarType: z.enum(["Single Track", "Transitional"]),
  programs: z.array(z.string().trim().min(2).max(200)).max(50),
  idmsInstitutionId: z.string().trim().optional(),
  idmsInstitutionName: z.string().trim().optional(),
  idmsSyncEnabled: z.boolean(),
}).refine((value) => !value.idmsSyncEnabled || Boolean(value.idmsInstitutionId?.trim()), {
  path: ["idmsInstitutionId"], message: "IDMS institution ID is required when sync is enabled",
})

export type InstitutionFormValues = z.infer<typeof formSchema>

interface InstitutionFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: Partial<InstitutionFormValues> & { _id?: string };
    availablePrograms?: string[];
}

export function InstitutionForm({ onSuccess, initialData, availablePrograms = [] }: InstitutionFormProps) {
  const [loading, setLoading] = useState(false)
  const [programmeSearch, setProgrammeSearch] = useState("")
  const [newProgramme, setNewProgramme] = useState("")
  const { authFetch } = useAuth()

  const form = useForm<InstitutionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      code: initialData?.code ?? "",
      district: initialData?.district ?? "",
      region: initialData?.region ?? "",
      location: initialData?.location ?? "",
      category: initialData?.category ?? "B",
      status: initialData?.status ?? "Day",
      gender: initialData?.gender ?? "Mixed",
      calendarType: initialData?.calendarType ?? "Single Track",
      programs: initialData?.programs ?? [],
      idmsInstitutionId: initialData?.idmsInstitutionId ?? "",
      idmsInstitutionName: initialData?.idmsInstitutionName ?? "",
      idmsSyncEnabled: initialData?.idmsSyncEnabled ?? false,
    },
  })

  async function onSubmit(values: InstitutionFormValues) {
    if (!initialData?._id && values.programs.length === 0) {
      form.setError("programs", { message: "Select or add at least one programme" })
      return
    }
    setLoading(true)
    try {
        const url = initialData?._id ? `/api/institutions/${initialData._id}` : '/api/institutions';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save institution')
        }
        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save institution")
    } finally {
        setLoading(false)
    }
  }

  function addProgramme() {
    const entered = newProgramme.trim()
    if (entered.length < 2) {
      form.setError("programs", { message: "Programme name must be at least 2 characters" })
      return
    }
    const programme = availablePrograms.find((value) => value.trim().toLowerCase() === entered.toLowerCase())?.trim() || entered
    const selected = form.getValues("programs")
    if (!selected.some((value) => value.toLowerCase() === programme.toLowerCase())) {
      form.setValue("programs", [...selected, programme], { shouldDirty: true, shouldValidate: true })
    }
    setNewProgramme("")
    setProgrammeSearch("")
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Institution Name</FormLabel>
                  <FormControl><Input placeholder="Ghana Tech Institute" disabled={Boolean(initialData?._id)} {...field} /></FormControl>
                  {initialData?._id && <p className="text-xs text-gray-500">Names are locked because existing records reference them.</p>}
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Institution Code</FormLabel>
                  <FormControl><Input placeholder="GTI-001" className="uppercase" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="district" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">District</FormLabel>
                  <FormControl><Input placeholder="Accra Metro" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Region</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-[300px]">
                        <SelectItem value="Ahafo">Ahafo</SelectItem>
                        <SelectItem value="Ashanti">Ashanti</SelectItem>
                        <SelectItem value="Bono">Bono</SelectItem>
                        <SelectItem value="Bono East">Bono East</SelectItem>
                        <SelectItem value="Central">Central</SelectItem>
                        <SelectItem value="Eastern">Eastern</SelectItem>
                        <SelectItem value="Greater Accra">Greater Accra</SelectItem>
                        <SelectItem value="North East">North East</SelectItem>
                        <SelectItem value="Northern">Northern</SelectItem>
                        <SelectItem value="Oti">Oti</SelectItem>
                        <SelectItem value="Savannah">Savannah</SelectItem>
                        <SelectItem value="Upper East">Upper East</SelectItem>
                        <SelectItem value="Upper West">Upper West</SelectItem>
                        <SelectItem value="Volta">Volta</SelectItem>
                        <SelectItem value="Western">Western</SelectItem>
                        <SelectItem value="Western North">Western North</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="location" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-800">Specific Location</FormLabel>
              <FormControl><Input placeholder="East Legon" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="A">Category A</SelectItem>
                      <SelectItem value="B">Category B</SelectItem>
                      <SelectItem value="C">Category C</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="calendarType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Academic Calendar Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Calendar type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Single Track">Single Track</SelectItem>
                      <SelectItem value="Transitional">Transitional</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Boarding">Boarding</SelectItem>
                      <SelectItem value="Day/Boarding">Day/Boarding</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-800">Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Boys">Boys</SelectItem>
                      <SelectItem value="Girls">Girls</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="programs" render={({ field }) => {
          const selected = field.value || []
          const options = Array.from(new Map([...availablePrograms, ...selected]
            .map((value) => value.trim()).filter(Boolean)
            .map((value) => [value.toLowerCase(), value] as const)).values()).sort((a, b) => a.localeCompare(b))
          const matching = options.filter((value) => value.toLowerCase().includes(programmeSearch.trim().toLowerCase()))
          const updateSelected = (values: string[]) => form.setValue("programs", values, { shouldDirty: true, shouldValidate: true })
          return (
            <FormItem className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <FormLabel className="text-sm font-semibold text-gray-800">Programmes offered</FormLabel>
                <p className="mt-1 text-xs text-gray-600">Select all programmes this institution offers. Add a new one if it is not listed.</p>
              </div>
              <Input
                aria-label="Search programmes"
                placeholder="Search programmes"
                value={programmeSearch}
                onChange={(event) => setProgrammeSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault() }}
                className="bg-white"
              />
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
                {matching.length ? matching.map((programme) => (
                  <label key={programme} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                    <Checkbox
                      checked={selected.includes(programme)}
                      onCheckedChange={(checked) => updateSelected(checked === true
                        ? [...selected, programme]
                        : selected.filter((value) => value !== programme))}
                      className="mt-0.5 border-gray-400"
                    />
                    <span className="break-words">{programme}</span>
                  </label>
                )) : <p className="px-2 py-3 text-sm text-gray-500">No matching programmes. Add one below.</p>}
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="New programme name"
                  placeholder="New programme name"
                  maxLength={200}
                  value={newProgramme}
                  onChange={(event) => setNewProgramme(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addProgramme() } }}
                  className="bg-white"
                />
                <Button type="button" variant="outline" onClick={addProgramme} aria-label="Add programme">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              {selected.length ? (
                <div className="flex flex-wrap gap-2" aria-label="Selected programmes">
                  {selected.map((programme) => (
                    <button key={programme} type="button" onClick={() => updateSelected(selected.filter((value) => value !== programme))}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-200"
                      aria-label={`Remove ${programme}`}>
                      {programme}<X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : null}
              <FormMessage />
            </FormItem>
          )
        }} />

        <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <div>
            <p className="text-sm font-black text-sky-950">IDMS Learner Registry</p>
            <p className="mt-1 text-xs text-sky-700">Map this institution to its permanent IDMS identifier before enabling learner synchronization.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField control={form.control} name="idmsInstitutionId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">IDMS Institution ID</FormLabel>
                <FormControl><Input placeholder="IDMS institution identifier" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="idmsInstitutionName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-gray-800">IDMS Institution Name</FormLabel>
                <FormControl><Input placeholder="Name shown in IDMS" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="idmsSyncEnabled" render={({ field }) => (
            <FormItem className="flex items-start gap-3 rounded-xl border border-sky-200 bg-white p-3">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <div>
                <FormLabel className="text-sm font-bold text-gray-900">Enable IDMS learner synchronization</FormLabel>
                <p className="mt-1 text-xs text-gray-500">Institution administrators will be able to preview and import IDMS learner changes.</p>
              </div>
            </FormItem>
          )} />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update Institution" : "Register Institution"}
        </Button>
      </form>
    </Form>
  )
}
