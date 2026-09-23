import { useState, useEffect, useMemo } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/toast"
import { useAuth } from "@/context/AuthContext"
import { Loader2, Search, Building2, Terminal, ShieldAlert, CheckCircle2, AlertCircle, Circle } from "lucide-react"
import type { IndustryPartner, Learner } from '@/types/models'
import { INDUSTRY_SECTORS } from "@/lib/constants"

const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North"
].sort()

const formSchema = z.object({
  placementType: z.enum(["registered", "custom", "learner_sourced"]),
  partner: z.string().optional(),
  
  // Custom fields
  companyName: z.string().optional(),
  sector: z.string().optional(),
  location: z.string().optional(),
  tradeArea: z.string().optional(),
  town: z.string().optional(),
  contactPerson: z.string().optional(),
  supervisorName: z.string().optional(),
  supervisorPhone: z.string().optional(),
  supervisorEmail: z.string().email("Invalid email").optional().or(z.literal('')),
  sourceNotes: z.string().optional(),
  worksiteMode: z.enum(['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises']),
  expectedOperatingArea: z.string().optional(),
  locationVerificationNotes: z.string().optional(),
  worksiteLocation: z.string().optional(),
  approveLocationException: z.boolean(),
  
  // Shared fields
  placementRegion: z.string().min(1, "Placement region is required"),
  learners: z.array(z.string()).min(1, "At least one learner is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
}).superRefine((data, ctx) => {
    if (data.endDate < data.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date cannot be before start date.', path: ['endDate'] });
    if (data.placementType === 'registered' && !data.partner) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Partner is required",
            path: ["partner"],
        });
    }
    if (data.placementType === 'custom' || data.placementType === 'learner_sourced') {
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
    if (['MobileField', 'NoFixedPremises'].includes(data.worksiteMode)) {
        if (!data.expectedOperatingArea?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Operating area is required.', path: ['expectedOperatingArea'] });
        if (!data.locationVerificationNotes?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Alternative location evidence is required.', path: ['locationVerificationNotes'] });
        if (!data.supervisorName?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Supervisor name is required.', path: ['supervisorName'] });
        if (!data.supervisorPhone?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Supervisor phone is required.', path: ['supervisorPhone'] });
    }
});

type FormValues = z.infer<typeof formSchema>

interface UnifiedPlacementFormProps {
  onSuccess: () => void;
  initialData?: { learner?: string };
}

export function UnifiedPlacementForm({ onSuccess, initialData }: UnifiedPlacementFormProps) {
  const [loading, setLoading] = useState(false)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [partners, setPartners] = useState<IndustryPartner[]>([])
  const [learners, setLearners] = useState<Learner[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [overrideWelWindow, setOverrideWelWindow] = useState(false)
  const [worksiteChoice, setWorksiteChoice] = useState<'partner' | 'different'>('partner')
  const { authFetch, user } = useAuth()

  const preSelectedLearnerId = initialData?.learner;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        placementType: "registered",
        partner: "", 
        placementRegion: "",
        learners: preSelectedLearnerId ? [preSelectedLearnerId] : [], 
        startDate: "", 
        endDate: "",
        companyName: "",
        sector: "",
        location: "",
        supervisorName: "",
        supervisorPhone: "",
        supervisorEmail: "",
        tradeArea: "",
        town: "",
        contactPerson: "",
        sourceNotes: ""
        ,worksiteMode: 'FixedSite', expectedOperatingArea: '', locationVerificationNotes: '', worksiteLocation: '', approveLocationException: false
    },
  })

  const placementType = form.watch("placementType");
  const selectedPartnerId = form.watch('partner')
  const worksiteMode = form.watch('worksiteMode')
  const approveLocationException = form.watch('approveLocationException')
  const flexibleWorksite = ['MobileField', 'NoFixedPremises'].includes(worksiteMode)
  const selectedPartner = useMemo(() => placementType === 'registered' ? partners.find(item => item._id === selectedPartnerId) : undefined, [placementType, partners, selectedPartnerId])
  const showWorksiteSection = placementType !== 'registered' || Boolean(selectedPartner)
  useEffect(() => {
    const site = selectedPartner?.coordinates
    setLat(String(site?.lat ?? '')); setLng(String(site?.lng ?? ''))
    setWorksiteChoice('partner')
    if (selectedPartner) {
      form.setValue('worksiteMode', selectedPartner.operatingModel || 'FixedSite')
      form.setValue('worksiteLocation', selectedPartner.location || '')
      form.setValue('locationVerificationNotes', selectedPartner.locationVerificationNotes || '')
      form.setValue('expectedOperatingArea', ['MobileField', 'NoFixedPremises'].includes(selectedPartner.operatingModel || '') ? (selectedPartner.location || selectedPartner.region) : '')
      form.setValue('supervisorName', selectedPartner.contactPerson || '')
      form.setValue('supervisorPhone', selectedPartner.contactPhone || '')
      form.setValue('supervisorEmail', selectedPartner.contactEmail || '')
    }
  }, [selectedPartner, form])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [partnersRes, learnersRes] = await Promise.all([
           authFetch('/api/industry-partners'),
           preSelectedLearnerId 
             ? authFetch(`/api/learners/${preSelectedLearnerId}`) // Fetch just the one if pre-selected
             : authFetch('/api/learners/placement-options')
        ]);
        
        const pData: IndustryPartner[] = await partnersRes.json();
        setPartners(pData.filter((p) => p.status === 'Active'));

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

  const selectedLearnerIds = form.watch("learners")
  const supervisorName = form.watch('supervisorName')
  const supervisorPhone = form.watch('supervisorPhone')
  const expectedOperatingArea = form.watch('expectedOperatingArea')
  const locationVerificationNotes = form.watch('locationVerificationNotes')
  const worksiteLocation = form.watch('worksiteLocation')
  const placementRegion = form.watch('placementRegion')
  const companyName = form.watch('companyName')
  const startDate = form.watch('startDate')
  const endDate = form.watch('endDate')
  useEffect(() => {
    if (!startDate) return
    let current = true
    const refreshCapacity = async () => {
      try {
        const response = await authFetch(`/api/industry-partners?capacityDate=${encodeURIComponent(startDate)}`)
        const data: IndustryPartner[] = await response.json()
        if (!response.ok) throw new Error()
        if (current) setPartners(data.filter(partner => partner.status === 'Active'))
      } catch { if (current) toast.error('Unable to refresh partner capacity for the selected start date') }
    }
    void refreshCapacity()
    return () => { current = false }
  }, [authFetch, startDate])
  const hasGps = Boolean(lat.trim() && lng.trim())
  const partnerCapacityAvailable = selectedPartner ? selectedPartner.institutionCapacity?.availableSlots ?? selectedPartner.totalSlots - selectedPartner.usedSlots : 0
  const worksiteConfirmed = placementType !== 'registered' || worksiteChoice === 'partner' || Boolean(worksiteLocation?.trim())
  const locationReady = flexibleWorksite
      ? Boolean(expectedOperatingArea?.trim() && locationVerificationNotes?.trim())
      : hasGps || (user?.role === 'Admin' && approveLocationException) || placementType === 'registered'
  const supervisorReady = Boolean(supervisorName?.trim() && supervisorPhone?.trim())
  const selectedWindowBlockedLearners = useMemo(() => learners.filter((learner) =>
      selectedLearnerIds.includes(learner._id) && learner.placementEligibility && !learner.placementEligibility.isEligible
  ), [learners, selectedLearnerIds])
  const canOverrideSelectedWindows = user?.role === 'Admin'
      && selectedWindowBlockedLearners.length > 0
      && selectedWindowBlockedLearners.every((learner) => learner.placementEligibility?.windowOverrideAllowed)

  const formatMissingField = (field: string) => {
      if (field === 'requiredDocuments') return 'required documents'
      if (field === 'phone') return 'phone number'
      return field
  }

  async function onSubmit(data: FormValues) {
    if (data.learners.length === 0) {
        toast.error("Please select at least one learner.");
        return;
    }
    if (data.placementType === 'registered' && worksiteChoice === 'different' && !data.worksiteLocation?.trim()) {
        toast.error('Enter the actual workplace address for this placement.');
        return;
    }

    const blockedLearners = learners.filter((learner) =>
      data.learners.includes(learner._id) && !learner.readiness?.isReadyForPlacement
    );
    if (blockedLearners.length > 0) {
        toast.error(`Complete intake readiness first: ${blockedLearners.map((learner) => learner.name).join(", ")}`);
        return;
    }

    if (selectedWindowBlockedLearners.length > 0 && !canOverrideSelectedWindows) {
        toast.error(`Placement is blocked by the WEL cohort calendar: ${selectedWindowBlockedLearners.map((learner) => learner.name).join(", ")}`);
        return;
    }
    if (selectedWindowBlockedLearners.length > 0 && !overrideWelWindow) {
        toast.error("Confirm the admin WEL window override before continuing.");
        return;
    }

    // Capacity checking for registered partners
    if (data.placementType === 'registered') {
        const partnerDoc = partners.find(p => p._id === data.partner);
        if (!partnerDoc) return;
        const availableSlots = partnerDoc.institutionCapacity?.availableSlots ?? (partnerDoc.totalSlots - partnerDoc.usedSlots)
        if (data.learners.length > availableSlots) {
            toast.error(`${partnerDoc.name} only has ${availableSlots} slots available to your institution.`);
            return;
        }
    }

    const firstLearnerId = data.learners[0];
    const selectedLearnerInfo = learners.find(l => l._id === firstLearnerId);

    setLoading(true)
    try {
      const coordinates = readCoordinates(lat, lng)
      const locationFields = {
          worksiteMode: data.worksiteMode,
          expectedOperatingArea: data.expectedOperatingArea,
          locationVerificationNotes: data.locationVerificationNotes,
          worksiteLocation: data.worksiteLocation,
          supervisorName: data.supervisorName,
          supervisorPhone: data.supervisorPhone,
          supervisorEmail: data.supervisorEmail,
          approveLocationException: data.approveLocationException,
      }
      if (data.placementType === 'registered') {
          // Send to placement-requests endpoint
          const res = await authFetch('/api/placement-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partner: data.partner,
                coordinates,
                learners: data.learners,
                program: selectedLearnerInfo?.program || 'Unassigned',
                requestedSlots: data.learners.length,
                placementRegion: data.placementRegion,
                startDate: data.startDate,
                endDate: data.endDate,
                overrideWelWindow: selectedWindowBlockedLearners.length > 0 && overrideWelWindow
                ,...locationFields
            }),
          })
          const resData = await res.json()
          if (!res.ok) throw new Error(resData.message || "Failed to submit request")
      } else if (data.placementType === 'custom' && (coordinates || (user?.role === 'Admin' && data.approveLocationException)) && ['Admin', 'Manager'].includes(user?.role || '')) {
          // Send to bulk placements endpoint
          const res = await authFetch('/api/placements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                learners: data.learners,
                companyName: data.companyName,
                coordinates,
                sector: data.sector,
                location: data.location,
                placementRegion: data.placementRegion,
                startDate: data.startDate,
                endDate: data.endDate,
                overrideWelWindow: selectedWindowBlockedLearners.length > 0 && overrideWelWindow
                ,...locationFields
            }),
          })
          const resData = await res.json()
          if (!res.ok) throw new Error(resData.message || "Failed to create placement records")
      } else {
          const res = await authFetch('/api/placement-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                learners: data.learners,
                program: selectedLearnerInfo?.program || 'Unassigned',
                requestedSlots: data.learners.length,
                placementRegion: data.placementRegion,
                startDate: data.startDate,
                endDate: data.endDate,
                sourceType: data.placementType === 'learner_sourced' ? 'LearnerFound' : 'InstitutionFound',
                coordinates,
                selfSourcedHost: {
                  companyName: data.companyName,
                  sector: data.sector,
                  location: data.location,
                  tradeArea: data.tradeArea,
                  town: data.town,
                  contactPerson: data.contactPerson,
                  contactPhone: data.supervisorPhone,
                  contactEmail: data.supervisorEmail,
                  notes: data.sourceNotes,
                },
                overrideWelWindow: selectedWindowBlockedLearners.length > 0 && overrideWelWindow
                ,...locationFields
            }),
          })
          const resData = await res.json()
          if (!res.ok) throw new Error(resData.message || "Failed to submit learner-sourced placement")
      }

      toast.success(data.placementType === 'custom' && (coordinates || (user?.role === 'Admin' && data.approveLocationException)) && ['Admin', 'Manager'].includes(user?.role || '') ? 'Learners placed successfully' : 'Request submitted. Institution management must review and activate it under Placement Requests.')
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
         setOverrideWelWindow(false)
         return [...currentSelected, learnerId];
      }
      setOverrideWelWindow(false)
      return currentSelected.filter(id => id !== learnerId);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="space-y-3" aria-label="Placement source">
          <div><p className="text-xs font-bold uppercase tracking-wider text-gray-500">Step 1</p><h3 className="text-lg font-black text-gray-900">How was the placement found?</h3></div>
          <div className="flex w-full max-w-2xl bg-gray-100 p-1 rounded-2xl">
            <button type="button" aria-pressed={placementType === 'registered'} onClick={() => form.setValue('placementType', 'registered')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all ${placementType === 'registered' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}><Building2 className="h-4 w-4" /> Registered Partner</button>
            <button type="button" aria-pressed={placementType === 'custom'} onClick={() => form.setValue('placementType', 'custom')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all ${placementType === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}><Terminal className="h-4 w-4" /> Custom Org</button>
            <button type="button" aria-pressed={placementType === 'learner_sourced'} onClick={() => form.setValue('placementType', 'learner_sourced')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all ${placementType === 'learner_sourced' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}><Search className="h-4 w-4" /> Learner Found</button>
          </div>
        </section>
        {selectedLearnerIds.length > 0 && (() => {
            const blockedLearners = learners.filter((learner) =>
                selectedLearnerIds.includes(learner._id) && !learner.readiness?.isReadyForPlacement
            )

            if (blockedLearners.length === 0) return null

            return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-bold">
                        <ShieldAlert className="h-4 w-4" />
                        Placement blocked until intake readiness is complete
                    </div>
                    <div className="mt-2 space-y-1">
                        {blockedLearners.map((learner) => (
                            <p key={learner._id}>
                                {learner.name}: {(learner.readiness?.missingFields || []).map(formatMissingField).join(", ")}
                            </p>
                        ))}
                    </div>
                </div>
            )
        })()}

        {selectedLearnerIds.length > 0 && (() => {
            const blockedByCalendar = selectedWindowBlockedLearners

            if (blockedByCalendar.length === 0) return null

            return (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    <div className="flex items-center gap-2 font-bold">
                        <ShieldAlert className="h-4 w-4" />
                        {canOverrideSelectedWindows ? 'Admin WEL window override required' : 'Placement blocked by WEL cohort calendar'}
                    </div>
                    <div className="mt-2 space-y-1">
                        {blockedByCalendar.map((learner) => (
                            <p key={learner._id}>
                                {learner.name}: {learner.placementEligibility?.reason}
                            </p>
                        ))}
                    </div>
                    {canOverrideSelectedWindows ? (
                        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-blue-200 bg-white/70 p-3">
                            <Checkbox
                                checked={overrideWelWindow}
                                onCheckedChange={(checked) => setOverrideWelWindow(checked === true)}
                                className="mt-0.5"
                            />
                            <span>
                                <span className="block font-bold">Open placement without a currently open WEL window</span>
                                <span className="block text-xs text-blue-700">This Admin override will be recorded in the audit log.</span>
                            </span>
                        </label>
                    ) : null}
                </div>
            )
        })()}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Eligible learners are current students without an active placement whose year group is within an active or preparation-stage WEL calendar window. Admins may explicitly override a window that is not currently open or configured. Previous WEL cycles stay attached to the learner profile as placement history.
        </div>
        
        {placementType === 'registered' ? (
            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50 space-y-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Step 2</p><h3 className="text-lg font-black text-gray-900">Select the industry partner</h3><p className="text-sm text-gray-600">Workplace details will appear after you select a partner.</p></div>
                <FormField control={form.control} name="partner" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900">Select Industry Partner *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                        const selectedPartner = partners.find((partner) => partner._id === value)
                        if (selectedPartner?.region) {
                          form.setValue("placementRegion", selectedPartner.region, { shouldValidate: true })
                        }
                      }}
                      value={field.value}
                    >
                        <FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Select an available partner" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-60">
                            {partners.length === 0 && <div className="p-4 text-sm text-gray-500 text-center">No partners have available slots.</div>}
                            {partners.map(p => ( 
                                <SelectItem key={p._id} value={p._id} disabled={(p.institutionCapacity?.availableSlots ?? p.totalSlots - p.usedSlots) <= 0}>
                                    <span className="font-semibold">{p.name}</span> <span className="ml-2 text-gray-400">{p.partnerType === 'MasterCraftPerson' ? 'MCP' : p.region} · {p.coordinates?.lat !== undefined && p.coordinates?.lng !== undefined ? 'GPS available' : ['MobileField', 'NoFixedPremises'].includes(p.operatingModel || '') ? 'Mobile evidence' : 'GPS pending'} · {p.institutionCapacity?.availableSlots ?? p.totalSlots - p.usedSlots} slots for you</span>
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
                 <div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Step 2</p><h3 className="text-lg font-black text-gray-900">Enter the organisation</h3></div>
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
                                {INDUSTRY_SECTORS.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
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
                        <FormLabel className="text-sm font-semibold text-gray-900">{placementType === 'learner_sourced' ? 'Proposed Supervisor Name' : 'Supervisor Name'}</FormLabel>
                        <FormControl><Input placeholder="Full Name" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="tradeArea" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Trade Area</FormLabel>
                        <FormControl><Input placeholder="Industrial Area" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="town" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">Town</FormLabel>
                        <FormControl><Input placeholder="Akosombo" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {placementType === 'learner_sourced' ? (
                        <FormField control={form.control} name="contactPerson" render={({ field }) => (
                            <FormItem>
                            <FormLabel className="text-sm font-semibold text-gray-900">Company Contact Person</FormLabel>
                            <FormControl><Input placeholder="Contact person" className="bg-white" {...field} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )} />
                    ) : null}
                    <FormField control={form.control} name="supervisorPhone" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">{placementType === 'learner_sourced' ? 'Company Phone' : 'Supervisor Phone'}</FormLabel>
                        <FormControl><Input placeholder="+233..." className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="supervisorEmail" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">{placementType === 'learner_sourced' ? 'Company Email' : 'Supervisor Email'}</FormLabel>
                        <FormControl><Input placeholder="supervisor@company.com" type="email" className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                </div>
                {placementType === 'learner_sourced' ? (
                    <FormField control={form.control} name="sourceNotes" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900">How the learner found this placement</FormLabel>
                        <FormControl><Input placeholder="Walk-in, referral, family contact, etc." className="bg-white" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )} />
                ) : null}
            </div>
        )}

        {selectedPartner && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5" aria-label="Selected partner summary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Selected partner</p><h3 className="mt-1 text-lg font-black text-gray-900">{selectedPartner.name}</h3><p className="text-sm text-gray-600">{selectedPartner.sector} · {selectedPartner.region}{selectedPartner.location ? ` · ${selectedPartner.location}` : ''}</p></div>
              <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white px-3 py-1 text-indigo-700">{selectedPartner.partnerType === 'MasterCraftPerson' ? 'MCP' : (selectedPartner.partnerType || 'Registered company').replace(/([a-z])([A-Z])/g, '$1 $2')}</span><span className="rounded-full bg-white px-3 py-1 text-gray-700">{partnerCapacityAvailable} slots available</span></div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3"><dt className="text-xs font-semibold text-gray-500">Workplace mode</dt><dd className="mt-1 font-bold text-gray-900">{(selectedPartner.operatingModel || 'FixedSite').replace(/([a-z])([A-Z])/g, '$1 $2')} <span className="ml-1 text-xs font-semibold text-indigo-600">From partner registry</span></dd></div>
              <div className="rounded-xl bg-white p-3"><dt className="text-xs font-semibold text-gray-500">GPS status</dt><dd className={`mt-1 font-bold ${selectedPartner.coordinates?.lat !== undefined && selectedPartner.coordinates?.lng !== undefined ? 'text-emerald-700' : 'text-amber-700'}`}>{selectedPartner.coordinates?.lat !== undefined && selectedPartner.coordinates?.lng !== undefined ? 'GPS coordinates available' : flexibleWorksite ? 'Permanent GPS not required' : 'GPS coordinates not recorded'}</dd></div>
              <div className="rounded-xl bg-white p-3"><dt className="text-xs font-semibold text-gray-500">Address</dt><dd className="mt-1 font-bold text-gray-900">{selectedPartner.location || 'Not recorded'} {selectedPartner.location && <span className="ml-1 text-xs font-semibold text-indigo-600">From partner registry</span>}</dd></div>
              <div className="rounded-xl bg-white p-3"><dt className="text-xs font-semibold text-gray-500">GhanaPost GPS</dt><dd className="mt-1 font-bold text-gray-900">{selectedPartner.ghanaPostGps || 'Not recorded'}</dd></div>
            </dl>
          </section>
        )}

        {selectedPartner && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div><h3 className="font-black text-gray-900">Will the learner work at this location?</h3><p className="text-sm text-gray-600">Confirm the registry location or enter the actual branch or project site for this placement.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => {
                setWorksiteChoice('partner'); setLat(String(selectedPartner.coordinates?.lat ?? '')); setLng(String(selectedPartner.coordinates?.lng ?? ''))
                form.setValue('worksiteMode', selectedPartner.operatingModel || 'FixedSite'); form.setValue('worksiteLocation', selectedPartner.location || '')
              }} className={`rounded-xl border p-4 text-left ${worksiteChoice === 'partner' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200'}`}><span className="block font-bold">Yes, use this workplace</span><span className="text-xs text-gray-600">Use the partner registry details shown above.</span></button>
              <button type="button" onClick={() => {
                setWorksiteChoice('different'); setLat(''); setLng(''); form.setValue('worksiteLocation', ''); form.setValue('approveLocationException', false)
              }} className={`rounded-xl border p-4 text-left ${worksiteChoice === 'different' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200'}`}><span className="block font-bold">No, use a different workplace</span><span className="text-xs text-gray-600">Enter the actual branch, workshop or project site.</span></button>
            </div>
          </section>
        )}

        {showWorksiteSection && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-label="Workplace details">
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Step 3 · Workplace for this placement</p><h3 className="mt-1 text-lg font-black text-gray-900">Confirm location and supervision</h3></div>
            {placementType === 'registered' && worksiteChoice === 'different' && <FormField control={form.control} name="worksiteLocation" render={({ field }) => <FormItem><FormLabel>Actual Workplace Address *</FormLabel><FormControl><Input className="bg-white" placeholder="Branch, workshop, landmark or project site" {...field} /></FormControl><p className="text-xs text-gray-500">This changes only this placement. It does not overwrite the shared partner registry.</p><FormMessage /></FormItem>} />}
            <FormField control={form.control} name="worksiteMode" render={({ field }) => (
              <FormItem><div className="flex items-center justify-between gap-2"><FormLabel>Workplace Mode *</FormLabel>{selectedPartner && worksiteChoice === 'partner' && <span className="text-xs font-semibold text-indigo-600">From partner registry</span>}</div><Select value={field.value} disabled={Boolean(selectedPartner && worksiteChoice === 'partner')} onValueChange={(value) => { field.onChange(value); form.setValue('approveLocationException', false) }}><FormControl><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger></FormControl><SelectContent>
                <SelectItem value="FixedSite">Fixed workshop</SelectItem><SelectItem value="HomeBased">Home-based</SelectItem><SelectItem value="MobileField">Mobile / field work</SelectItem><SelectItem value="MultipleSites">Multiple worksites</SelectItem><SelectItem value="TemporarySite">Temporary / project site</SelectItem><SelectItem value="NoFixedPremises">No fixed premises</SelectItem>
              </SelectContent></Select><FormMessage /></FormItem>
            )} />
            {flexibleWorksite ? <>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>No permanent GPS point is required.</strong> Describe where the learner normally works and how a monitoring officer can arrange a visit. The visit will capture the actual encounter location.</div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="expectedOperatingArea" render={({ field }) => <FormItem><FormLabel>Expected Operating Area *</FormLabel><FormControl><Input className="bg-white" placeholder="Communities, district or typical project sites" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="locationVerificationNotes" render={({ field }) => <FormItem><FormLabel>Alternative Location Evidence *</FormLabel><FormControl><Input className="bg-white" placeholder="Landmarks, supervisor confirmation, job card or visit arrangement" {...field} /></FormControl><FormMessage /></FormItem>} />
              </div>
            </> : <>
              <WorkplaceCoordinates lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b); form.setValue('approveLocationException', false) }} disabled={loading} />
              <div className={`rounded-xl border p-4 text-sm ${hasGps ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{hasGps ? <><strong>GPS coordinates available.</strong> Confirm they represent the learner’s actual workplace.</> : <><strong>GPS coordinates are missing.</strong> Capture them while at the workplace. A registered-partner request can still be submitted for management follow-up.</>}</div>
            </>}
            {placementType === 'registered' && <div className="grid gap-4 md:grid-cols-2"><FormField control={form.control} name="supervisorName" render={({ field }) => <FormItem><FormLabel>Workplace Supervisor {flexibleWorksite ? '*' : ''}</FormLabel><FormControl><Input className="bg-white" placeholder="Full name" {...field} /></FormControl>{selectedPartner?.contactPerson && <p className="text-xs font-semibold text-indigo-600">Prefilled from partner contact</p>}<FormMessage /></FormItem>} /><FormField control={form.control} name="supervisorPhone" render={({ field }) => <FormItem><FormLabel>Supervisor Phone {flexibleWorksite ? '*' : ''}</FormLabel><FormControl><Input className="bg-white" placeholder="+233..." {...field} /></FormControl>{selectedPartner?.contactPhone && <p className="text-xs font-semibold text-indigo-600">Prefilled from partner contact</p>}<FormMessage /></FormItem>} /></div>}
            {user?.role === 'Admin' && !hasGps && placementType === 'custom' && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Checkbox checked={approveLocationException} onCheckedChange={(checked) => form.setValue('approveLocationException', checked === true)} className="mt-0.5" /><span><span className="block font-bold">Approve {flexibleWorksite ? 'alternative location evidence' : 'provisional activation'}</span><span className="block text-xs">{flexibleWorksite ? 'This decision is recorded in the audit log.' : 'GPS must be captured within 14 days.'}</span></span></label>}
          </section>
        )}

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
          <FormField control={form.control} name="placementRegion" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Placement Region *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select the region where the learner will be placed" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-60">
                  {GHANA_REGIONS.map((region) => (
                    <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Choose the region of the actual workplace or placement site.</p>
              <FormMessage />
            </FormItem>
          )} />
        </div>

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
                                    placeholder="Search eligible learners by name or tracking ID..." 
                                    value={searchQuery}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                    className="h-10 pl-9 bg-gray-50 border-transparent"
                                />
                            </div>
                        
                            {Object.keys(learnersByProgram).length === 0 && (
                                <div className="text-center text-sm text-gray-500 py-8">No eligible learners found.</div>
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
                                                    {learner.placementEligibility && !learner.placementEligibility.isEligible && (
                                                        <p className="text-xs text-blue-700 font-semibold mt-1">Admin window override available</p>
                                                    )}
                                                    {!learner.readiness?.isReadyForPlacement && (
                                                        <p className="text-xs text-amber-700 font-semibold mt-1">
                                                            Missing: {(learner.readiness?.missingFields || []).map(formatMissingField).join(", ")}
                                                        </p>
                                                    )}
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

        <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-label="Placement readiness">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-gray-900">Placement readiness</h3><p className="text-sm text-gray-500">Complete the items below before submission.</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">{selectedLearnerIds.length} learner{selectedLearnerIds.length === 1 ? '' : 's'}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Organisation selected', ready: placementType === 'registered' ? Boolean(selectedPartner) : Boolean(companyName?.trim()), note: placementType === 'registered' && !selectedPartner ? 'Select a partner' : 'Complete' },
              { label: 'Capacity available', ready: placementType !== 'registered' || Boolean(selectedPartner && selectedLearnerIds.length <= partnerCapacityAvailable), note: placementType === 'registered' ? `${partnerCapacityAvailable} slots available` : 'Reviewed during activation' },
              { label: 'Workplace confirmed', ready: showWorksiteSection && worksiteConfirmed, note: !showWorksiteSection ? 'Select a partner first' : placementType !== 'registered' ? 'Organisation workplace' : worksiteChoice === 'different' ? 'Placement-specific site' : 'Registry site' },
              { label: flexibleWorksite ? 'Location evidence' : 'Workplace GPS', ready: locationReady, note: locationReady ? (flexibleWorksite ? 'Evidence provided' : hasGps ? 'Coordinates available' : 'Management follow-up') : flexibleWorksite ? 'Describe area and evidence' : 'Capture GPS or request follow-up' },
              { label: 'Supervisor contact', ready: supervisorReady, warning: !flexibleWorksite, note: supervisorReady ? 'Name and phone provided' : flexibleWorksite ? 'Required for this mode' : 'Can be completed at activation' },
              { label: 'Eligible learners', ready: selectedLearnerIds.length > 0 && !learners.some(item => selectedLearnerIds.includes(item._id) && !item.readiness?.isReadyForPlacement), note: selectedLearnerIds.length ? `${selectedLearnerIds.length} selected` : 'Select at least one learner' },
              { label: 'Placement dates', ready: Boolean(startDate && endDate && endDate >= startDate), note: startDate && endDate ? `${startDate} to ${endDate}` : 'Select start and end dates' },
              { label: 'Placement region', ready: Boolean(placementRegion), note: placementRegion || 'Select actual worksite region' },
            ].map(item => {
              const informational = item.warning && !item.ready
              const Icon = item.ready ? CheckCircle2 : informational ? AlertCircle : Circle
              return <div key={item.label} className={`flex items-start gap-3 rounded-xl border p-3 ${item.ready ? 'border-emerald-100 bg-emerald-50' : informational ? 'border-amber-100 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.ready ? 'text-emerald-600' : informational ? 'text-amber-600' : 'text-gray-400'}`} /><span><span className="block text-sm font-bold text-gray-900">{item.label}</span><span className="block text-xs text-gray-600">{item.note}</span></span></div>
            })}
          </div>
        </section>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : placementType === 'learner_sourced' ? 'Submit for Verification' : placementType === 'registered' ? 'Submit for Activation' : user?.role === 'Admin' && approveLocationException ? flexibleWorksite ? 'Activate with Approved Evidence' : 'Activate Provisionally' : 'Confirm Placement'}
        </Button>
      </form>
    </Form>
  )
}
