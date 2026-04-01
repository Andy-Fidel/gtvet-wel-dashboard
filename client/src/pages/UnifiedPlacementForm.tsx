import { useState, useEffect, useMemo } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Loader2, Search, Building2, Terminal } from "lucide-react"
import type { IndustryPartner, Learner } from '@/types/models'

const formSchema = z.object({
  placementType: z.enum(["registered", "custom"]),
  partner: z.string().optional(),
  
  // Custom fields
  companyName: z.string().optional(),
  sector: z.string().optional(),
  location: z.string().optional(),
  supervisorName: z.string().optional(),
  supervisorEmail: z.string().email("Invalid email").optional().or(z.literal('')),
  
  // Shared fields
  learners: z.array(z.string()).min(1, "At least one learner is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
}).superRefine((data, ctx) => {
    if (data.placementType === 'registered' && !data.partner) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Partner is required",
            path: ["partner"],
        });
    }
    if (data.placementType === 'custom') {
        if (!data.companyName || data.companyName.trim().length < 2) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company Name is required", path: ["companyName"] });
        }
        if (!data.sector) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sector is required", path: ["sector"] });
        }
        if (!data.location || data.location.trim().length < 2) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Location is required", path: ["location"] });
        }
    }
});

type FormValues = z.infer<typeof formSchema>

interface UnifiedPlacementFormProps {
  onSuccess: () => void;
  initialData?: { learner?: string };
}

export function UnifiedPlacementForm({ onSuccess, initialData }: UnifiedPlacementFormProps) {
  const [loading, setLoading] = useState(false)
  const [partners, setPartners] = useState<IndustryPartner[]>([])
  const [learners, setLearners] = useState<Learner[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const { authFetch } = useAuth()

  const preSelectedLearnerId = initialData?.learner;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        placementType: "registered",
        partner: "", 
        learners: preSelectedLearnerId ? [preSelectedLearnerId] : [], 
        startDate: "", 
        endDate: "",
        companyName: "",
        sector: "",
        location: "",
        supervisorName: "",
        supervisorEmail: ""
    },
  })

  const placementType = form.watch("placementType");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [partnersRes, learnersRes] = await Promise.all([
           authFetch('/api/industry-partners'),
           preSelectedLearnerId 
             ? authFetch(`/api/learners/${preSelectedLearnerId}`) // Fetch just the one if pre-selected
             : authFetch('/api/learners?status=Pending')
        ]);
        
        const pData: IndustryPartner[] = await partnersRes.json();
        setPartners(pData.filter((p) => p.status === 'Active' && p.totalSlots > p.usedSlots));

        if (preSelectedLearnerId) {
             const lData: Learner = await learnersRes.json();
             setLearners([lData]);
        } else {
             const lData: Learner[] = await learnersRes.json();
             setLearners(lData);
        }

      } catch {
        toast.error("Failed to load form data");
      }
    }
    fetchData();
  }, [authFetch, preSelectedLearnerId]);

  const learnersByProgram = useMemo(() => {
      const groups: Record<string, Learner[]> = {};
      const lowerQuery = searchQuery.toLowerCase();
      learners.forEach(l => {
          if (searchQuery) {
              const matchesSearch = l.firstName?.toLowerCase().includes(lowerQuery) || 
                                    l.lastName?.toLowerCase().includes(lowerQuery) || 
                                    l.trackingId?.toLowerCase().includes(lowerQuery);
              if (!matchesSearch) return;
          }
          const prog = l.program || 'Unassigned';
          if (!groups[prog]) groups[prog] = [];
          if (groups[prog].length < 50) groups[prog].push(l);
      });
      return groups;
  }, [learners, searchQuery]);

  async function onSubmit(data: FormValues) {
    if (data.learners.length === 0) {
        toast.error("Please select at least one learner.");
        return;
    }

    // Capacity checking for registered partners
    if (data.placementType === 'registered') {
        const partnerDoc = partners.find(p => p._id === data.partner);
        if (!partnerDoc) return;
        if (data.learners.length > (partnerDoc.totalSlots - partnerDoc.usedSlots)) {
            toast.error(`${partnerDoc.name} only has ${partnerDoc.totalSlots - partnerDoc.usedSlots} slots available.`);
            return;
        }
    }

    const firstLearnerId = data.learners[0];
    const selectedLearnerInfo = learners.find(l => l._id === firstLearnerId);

    setLoading(true)
    try {
      if (data.placementType === 'registered') {
          // Send to placement-requests endpoint
          const res = await authFetch('/api/placement-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partner: data.partner,
                learners: data.learners,
                program: selectedLearnerInfo?.program || 'Unassigned',
                requestedSlots: data.learners.length,
                startDate: data.startDate,
                endDate: data.endDate
            }),
          })
          const resData = await res.json()
          if (!res.ok) throw new Error(resData.message || "Failed to submit request")
      } else {
          // Send to bulk placements endpoint
          const res = await authFetch('/api/placements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                learners: data.learners,
                companyName: data.companyName,
                sector: data.sector,
                location: data.location,
                supervisorName: data.supervisorName,
                supervisorEmail: data.supervisorEmail,
                startDate: data.startDate,
                endDate: data.endDate
            }),
          })
          const resData = await res.json()
          if (!res.ok) throw new Error(resData.message || "Failed to create placement records")
      }

      toast.success("Learners placed successfully")
      onSuccess()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const toggleLearner = (learnerId: string, currentSelected: string[], program: string) => {
      if (!currentSelected.includes(learnerId)) {
         if (currentSelected.length > 0) {
             const firstSelected = learners.find(l => l._id === currentSelected[0]);
             if (firstSelected?.program !== program) {
                 toast.warning("Please group placements by trade/program. You cannot mix different programs in one placement.");
                 return currentSelected;
             }
         }
         return [...currentSelected, learnerId];
      }
      return currentSelected.filter(id => id !== learnerId);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Placement Type Toggle */}
        <div className="flex bg-gray-100 p-1 rounded-2xl w-full max-w-md mx-auto">
            <button
                type="button"
                onClick={() => form.setValue("placementType", "registered")}
                className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                    placementType === "registered" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
            >
                <Building2 className="h-4 w-4" /> Registered Partner
            </button>
            <button
                type="button"
                onClick={() => form.setValue("placementType", "custom")}
                className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                    placementType === "custom" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
            >
                <Terminal className="h-4 w-4" /> Custom Org
            </button>
        </div>

        {placementType === 'registered' ? (
            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50 space-y-4">
                <FormField control={form.control} name="partner" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Select Industry Partner *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Select an available partner" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-60">
                            {partners.length === 0 && <div className="p-4 text-sm text-gray-500 text-center">No partners have available slots.</div>}
                            {partners.map(p => ( 
                                <SelectItem key={p._id} value={p._id}>
                                    <span className="font-semibold">{p.name}</span> <span className="text-gray-400 ml-2">({p.totalSlots - p.usedSlots} slots available)</span>
                                </SelectItem> 
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
        ) : (
            <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50 space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="companyName" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Company Name *</FormLabel>
                        <FormControl><Input placeholder="E.g. Tech Solutions Ltd" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="sector" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Industry Sector *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Select sector" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Information Technology">Information Technology</SelectItem>
                                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                                <SelectItem value="Agriculture">Agriculture</SelectItem>
                                <SelectItem value="Construction">Construction</SelectItem>
                                <SelectItem value="Healthcare">Healthcare</SelectItem>
                                <SelectItem value="Hospitality">Hospitality</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="location" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Location / Address *</FormLabel>
                        <FormControl><Input placeholder="City, Region" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="supervisorName" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Supervisor Name</FormLabel>
                        <FormControl><Input placeholder="Full Name" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="supervisorEmail" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Supervisor Email (Optional)</FormLabel>
                    <FormControl><Input placeholder="supervisor@company.com" type="email" className="bg-white" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
        )}

        <div className="bg-gray-50 border border-gray-100 p-5 p-0 rounded-2xl">
            <FormField control={form.control} name="learners" render={({ field }) => (
                <FormItem className="p-5 pb-0">
                    <FormLabel className="text-sm font-semibold text-gray-900 flex justify-between">
                        <span>Select Learners to Place *</span>
                        <span className="text-indigo-600">{field.value.length} selected</span>
                    </FormLabel>
                    
                    {preSelectedLearnerId ? (
                        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-center gap-3">
                            <Checkbox checked={true} disabled className="mt-0.5" />
                            <div>
                                <p className="font-bold text-indigo-900 text-sm">{learners[0]?.firstName} {learners[0]?.lastName}</p>
                                <p className="text-xs text-indigo-600 font-mono">{learners[0]?.trackingId}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-4 border border-gray-200 rounded-xl max-h-[300px] overflow-y-auto space-y-5">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input 
                                    placeholder="Search pending learners by name or tracking ID..." 
                                    value={searchQuery}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                    className="h-10 pl-9 bg-gray-50 border-transparent"
                                />
                            </div>
                        
                            {Object.keys(learnersByProgram).length === 0 && (
                                <div className="text-center text-sm text-gray-500 py-8">No pending learners found.</div>
                            )}
                            {Object.entries(learnersByProgram).map(([program, programLearners]) => (
                                <div key={program}>
                                    <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">{program}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {programLearners.map((learner: Learner) => (
                                            <div key={learner._id} className={`flex items-start space-x-3 p-3 rounded-xl border transition-colors ${field.value.includes(learner._id) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-transparent text-gray-700'}`}>
                                                <Checkbox 
                                                    id={learner._id} 
                                                    checked={field.value.includes(learner._id)}
                                                    onCheckedChange={() => form.setValue('learners', toggleLearner(learner._id, field.value, learner.program || 'Unassigned'))}
                                                    className="mt-1"
                                                />
                                                <div className="leading-tight">
                                                    <label htmlFor={learner._id} className="font-semibold cursor-pointer text-sm">{learner.firstName} {learner.lastName}</label>
                                                    <p className="text-xs opacity-70 mt-0.5 font-mono">{learner.trackingId}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <FormMessage />
                </FormItem>
            )} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Start Date *</FormLabel>
                    <FormControl><Input type="date" className="bg-white border-gray-200" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">End Date *</FormLabel>
                    <FormControl><Input type="date" className="bg-white border-gray-200" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Confirm Placement'}
        </Button>
      </form>
    </Form>
  )
}
