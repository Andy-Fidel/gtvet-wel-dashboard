import { useState } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Loader2, UploadCloud } from "lucide-react"

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  sector: z.string().min(2, "Sector is required"),
  region: z.string().min(2, "Region is required"),
  district: z.string().optional(),
  location: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal('')),
  website: z.string().url("Invalid URL").optional().or(z.literal('')),
  totalSlots: z.number().min(0, "Capacity cannot be negative"),
  status: z.enum(["Active", "Inactive"]),
  mouDocumentUrl: z.string().optional(),
})

type IndustryPartnerFormValues = z.infer<typeof formSchema>

interface IndustryPartnerFormProps {
  onSuccess: () => void;
  initialData?: IndustryPartnerFormValues & { _id?: string; usedSlots?: number; mouDocumentUrl?: string };
}

const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North"
].sort();

export function IndustryPartnerForm({ onSuccess, initialData }: IndustryPartnerFormProps) {
  const [loading, setLoading] = useState(false)
  const [mouFile, setMouFile] = useState<File | null>(null)
  const normalizeNumberInput = (value: string) => (value === "" ? 0 : parseInt(value, 10))
  const { authFetch } = useAuth()

  const form = useForm<IndustryPartnerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "", sector: "", region: "", district: "", location: "",
      contactPerson: "", contactPhone: "", contactEmail: "", website: "",
      totalSlots: 0, status: "Active", mouDocumentUrl: "",
    },
  })

  async function onSubmit(data: IndustryPartnerFormValues) {
    setLoading(true)
    try {
      const finalData = { ...data };

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
        
        {/* Company Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  <FormControl><Input placeholder="e.g. IT, Automotive" {...field} /></FormControl>
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
        </div>

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
