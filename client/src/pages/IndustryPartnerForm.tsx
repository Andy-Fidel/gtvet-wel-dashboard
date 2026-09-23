import { useEffect, useMemo, useState } from "react"
import { WorkplaceCoordinates, readCoordinates } from '@/components/WorkplaceCoordinates'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { useAuth } from "@/context/AuthContext"
import { Loader2, UploadCloud } from "lucide-react"
import { INDUSTRY_SECTORS } from '@/lib/constants'

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  sector: z.string().min(2, "Sector is required"),
  region: z.string().min(2, "Region is required"),
  district: z.string().optional(),
  tradeArea: z.string().optional(),
  town: z.string().optional(),
  location: z.string().optional(),
  partnerType: z.enum(['RegisteredCompany', 'MasterCraftPerson', 'Government', 'NGO', 'Other']),
  operatingModel: z.enum(['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises']),
  locationVerificationNotes: z.string().max(3000).optional(),
  ghanaPostGps: z.string().max(200).optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal('')),
  website: z.string().url("Invalid URL").optional().or(z.literal('')),
  totalSlots: z.number().min(0, "Capacity cannot be negative"),
  status: z.enum(["Active", "Inactive"]),
  mouDocumentUrl: z.string().optional(),
}).superRefine((data, ctx) => {
  if (['MobileField', 'NoFixedPremises'].includes(data.operatingModel) && !data.locationVerificationNotes?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationVerificationNotes'], message: 'Describe the operating area and how this partner can be located.' })
  }
})

type IndustryPartnerFormValues = z.infer<typeof formSchema>

interface IndustryPartnerFormProps {
  onSuccess: () => void;
  initialData?: Partial<IndustryPartnerFormValues> & { _id?: string; usedSlots?: number; mouDocumentUrl?: string; coordinates?: { lat?: number; lng?: number } };
}

const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North"
].sort();
const NO_TRADE_AREA = '__not_specified__'

type InstitutionPrograms = { programs?: string[] }

export function IndustryPartnerForm({ onSuccess, initialData }: IndustryPartnerFormProps) {
  const [loading, setLoading] = useState(false)
  const [lat, setLat] = useState(String(initialData?.coordinates?.lat ?? ''))
  const [lng, setLng] = useState(String(initialData?.coordinates?.lng ?? ''))
  const [mouFile, setMouFile] = useState<File | null>(null)
  const [tradeAreas, setTradeAreas] = useState<string[]>(initialData?.tradeArea ? [initialData.tradeArea] : [])
  const [loadingTradeAreas, setLoadingTradeAreas] = useState(true)
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : parseInt(value, 10))
  const { authFetch, user } = useAuth()

  const form = useForm<IndustryPartnerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", sector: "", region: "", district: "", tradeArea: "", town: "", location: "",
      partnerType: 'RegisteredCompany', operatingModel: 'FixedSite', locationVerificationNotes: '', ghanaPostGps: '',
      contactPerson: "", contactPhone: "", contactEmail: "", website: "",
      totalSlots: 0, status: "Active", mouDocumentUrl: "",
      ...initialData,
    },
  })
  const operatingModel = form.watch('operatingModel')
  const sectorOptions = useMemo(() => initialData?.sector && !INDUSTRY_SECTORS.includes(initialData.sector as (typeof INDUSTRY_SECTORS)[number])
    ? [initialData.sector, ...INDUSTRY_SECTORS]
    : [...INDUSTRY_SECTORS], [initialData?.sector])

  useEffect(() => {
    if (!user?.role) return
    let current = true
    const loadTradeAreas = async () => {
      setLoadingTradeAreas(true)
      try {
        const institutionUser = ['Admin', 'Manager'].includes(user?.role || '')
        const response = await authFetch(institutionUser ? '/api/my-institution' : '/api/institutions')
        const data: InstitutionPrograms | InstitutionPrograms[] = await response.json()
        if (!response.ok) throw new Error('Unable to load institution programmes')
        const institutions = Array.isArray(data) ? data : [data]
        const values = institutions.flatMap(institution => institution.programs || []).map(value => value.trim()).filter(Boolean)
        if (initialData?.tradeArea) values.push(initialData.tradeArea)
        if (current) setTradeAreas([...new Set(values)].sort((a, b) => a.localeCompare(b)))
      } catch (error) {
        if (current) toast.error(error instanceof Error ? error.message : 'Unable to load institution programmes')
      } finally { if (current) setLoadingTradeAreas(false) }
    }
    void loadTradeAreas()
    return () => { current = false }
  }, [authFetch, initialData?.tradeArea, user?.role])

  async function onSubmit(data: IndustryPartnerFormValues) {
    setLoading(true)
    try {
      const finalData = { ...data, coordinates: readCoordinates(lat, lng) };

      if (mouFile) {
        toast.info("Uploading MoU document...");
        const formData = new FormData();
        formData.append('file', mouFile);
        formData.append('category', 'MoU');
        
        const uploadRes = await authFetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadRes.ok) throw new Error("Document upload failed");
        
        const uploadData = await uploadRes.json();
        finalData.mouDocumentUrl = uploadData.url;
      }

      const url = initialData?._id ? `/api/industry-partners/${initialData._id}` : '/api/industry-partners';
      const res = await authFetch(url, {
        method: initialData?._id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.message || "Failed to save")
      onSuccess()
    } catch (error) {
      toast.error((error as Error).message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Register the partner now even if GPS is unavailable. Fixed workplaces will enter the GPS follow-up queue; mobile and no-premises partners use operating-area evidence.
        </div>

        {/* Company Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="partnerType" render={({ field }) => (
              <FormItem><FormLabel>Partner Type *</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                <SelectItem value="RegisteredCompany">Registered company</SelectItem><SelectItem value="MasterCraftPerson">Master Craft Person (MCP)</SelectItem><SelectItem value="Government">Government</SelectItem><SelectItem value="NGO">NGO</SelectItem><SelectItem value="Other">Other</SelectItem>
              </SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="operatingModel" render={({ field }) => (
              <FormItem><FormLabel>Operating Model *</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                <SelectItem value="FixedSite">Fixed workshop</SelectItem><SelectItem value="HomeBased">Home-based</SelectItem><SelectItem value="MobileField">Mobile / field work</SelectItem><SelectItem value="MultipleSites">Multiple worksites</SelectItem><SelectItem value="TemporarySite">Temporary / project site</SelectItem><SelectItem value="NoFixedPremises">No fixed premises</SelectItem>
              </SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Company Name *</FormLabel>
                  <FormControl><Input placeholder="Tech Innovators Ltd" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="sector" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Sector *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-72">
                      {sectorOptions.map(sector => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Region *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-60">
                        {GHANA_REGIONS.map(r => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="totalSlots" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Total Capacity (Slots) *</FormLabel>
                  <FormControl><Input type="number" {...field} value={Number.isFinite(field.value) ? field.value : ""} onChange={e => field.onChange(normalizeNumberInput(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="tradeArea" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Trade Area</FormLabel>
                  <Select value={field.value || NO_TRADE_AREA} onValueChange={value => field.onChange(value === NO_TRADE_AREA ? '' : value)} disabled={loadingTradeAreas}>
                    <FormControl><SelectTrigger><SelectValue placeholder={loadingTradeAreas ? 'Loading programmes…' : 'Select programme'} /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NO_TRADE_AREA}>Not specified</SelectItem>
                      {tradeAreas.map(programme => <SelectItem key={programme} value={programme}>{programme}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!loadingTradeAreas && tradeAreas.length === 0 ? <p className="text-xs text-amber-700">No programmes are configured for the available institution scope.</p> : null}
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="town" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Town</FormLabel>
                  <FormControl><Input placeholder="e.g. Kumasi" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem><FormLabel>Address / Location Description</FormLabel><FormControl><Input placeholder="Landmark, street or operating area" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ghanaPostGps" render={({ field }) => (
              <FormItem><FormLabel>GhanaPost GPS Address</FormLabel><FormControl><Input placeholder="e.g. GA-123-4567" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>

        <WorkplaceCoordinates lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b) }} disabled={loading} />
        <p className="text-xs text-muted-foreground">Coordinates are optional during registration. Capture them later for fixed, home-based, multi-site and temporary workplaces.</p>
        <FormField control={form.control} name="locationVerificationNotes" render={({ field }) => (
          <FormItem><FormLabel>{['MobileField', 'NoFixedPremises'].includes(operatingModel) ? 'Operating Area and Location Evidence *' : 'Location Verification Notes'}</FormLabel><FormControl><Textarea rows={3} placeholder={['MobileField', 'NoFixedPremises'].includes(operatingModel) ? 'Describe usual communities, project sites, landmarks and how visits will be arranged.' : 'Add directions, landmark or GPS follow-up notes.'} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <FormField control={form.control} name="contactPerson" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Contact Person</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="contactPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Phone</FormLabel>
                  <FormControl><Input placeholder="024XXXXXXX" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Email</FormLabel>
                  <FormControl><Input type="email" placeholder="john@company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="website" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-700">Website</FormLabel>
                  <FormControl><Input placeholder="https://company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        {/* MoU Upload */}
        <div className="space-y-2 pt-2">
            <label className="block text-sm font-semibold text-gray-700">MoU Document (Optional)</label>
            <div className="flex items-center gap-4">
               {initialData?.mouDocumentUrl && !mouFile && (
                  <a href={initialData.mouDocumentUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 uppercase tracking-widest hover:bg-blue-100 transition-colors">
                      View Current MoU
                  </a>
               )}
               <label className="flex-1 cursor-pointer group">
                  <div className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-4 transition-all ${mouFile ? 'border-green-400 bg-green-50/50' : 'border-gray-200 hover:border-black bg-gray-50/50 hover:bg-gray-50'}`}>
                     <UploadCloud className={`h-5 w-5 ${mouFile ? 'text-green-500' : 'text-gray-400 group-hover:text-black'}`} />
                     <span className={`text-sm font-bold ${mouFile ? 'text-green-600' : 'text-gray-500 group-hover:text-gray-900'}`}>{mouFile ? mouFile.name : 'Click to Browse File'}</span>
                  </div>
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                          setMouFile(e.target.files[0]);
                      }
                  }} />
               </label>
            </div>
            <p className="text-xs text-muted-foreground font-medium ml-1">Accepted formats: PDF, DOC, DOCX. Max size: 5MB.</p>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-4">
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : (initialData ? 'Save Changes' : 'Register Partner')}
        </Button>
      </form>
    </Form>
  )
}
