import { useCallback, useEffect, useMemo, useState } from "react"
import { BriefcaseBusiness, CalendarClock, Edit3, MapPin, Plus, Send, Users, XCircle } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import type { Vacancy } from "@/types/models"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type VacancyStatus = Vacancy["status"]

type VacancyDraft = {
  title: string
  program: string
  tradeArea: string
  description: string
  requirements: string
  district: string
  location: string
  slots: number
  applicationDeadline: string
  placementStartDate: string
  placementEndDate: string
  contactEmail: string
  contactPhone: string
  status: "Draft" | "Published"
}

const EMPTY_DRAFT: VacancyDraft = {
  title: "",
  program: "",
  tradeArea: "",
  description: "",
  requirements: "",
  district: "",
  location: "",
  slots: 1,
  applicationDeadline: "",
  placementStartDate: "",
  placementEndDate: "",
  contactEmail: "",
  contactPhone: "",
  status: "Published",
}

const toDateInput = (value?: string) => value ? value.slice(0, 10) : ""

const toDraft = (vacancy: Vacancy): VacancyDraft => ({
  title: vacancy.title,
  program: vacancy.program,
  tradeArea: vacancy.tradeArea || "",
  description: vacancy.description,
  requirements: vacancy.requirements || "",
  district: vacancy.district || "",
  location: vacancy.location || "",
  slots: vacancy.slots,
  applicationDeadline: toDateInput(vacancy.applicationDeadline),
  placementStartDate: toDateInput(vacancy.placementStartDate),
  placementEndDate: toDateInput(vacancy.placementEndDate),
  contactEmail: vacancy.contactEmail || "",
  contactPhone: vacancy.contactPhone || "",
  status: vacancy.status === "Draft" ? "Draft" : "Published",
})

const STATUS_STYLES: Record<VacancyStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Closed: "bg-rose-100 text-rose-700 border-rose-200",
}

export default function PartnerVacancies() {
  const { authFetch, user } = useAuth()
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVacancy, setEditingVacancy] = useState<Vacancy | null>(null)
  const [draft, setDraft] = useState<VacancyDraft>(EMPTY_DRAFT)
  const [statusFilter, setStatusFilter] = useState<"All" | VacancyStatus>("All")
  const isCoordinator = user?.partnerPortalRole !== "Supervisor"

  const fetchVacancies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "All") params.set("status", statusFilter)
      const response = await authFetch(`/api/vacancies?${params.toString()}`)
      const payload = await response.json().catch(() => [])
      if (!response.ok) throw new Error(payload.message || "Failed to load vacancies")
      setVacancies(Array.isArray(payload) ? payload : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load vacancies")
    } finally {
      setLoading(false)
    }
  }, [authFetch, statusFilter])

  useEffect(() => {
    void fetchVacancies()
  }, [fetchVacancies])

  const summary = useMemo(() => ({
    total: vacancies.length,
    published: vacancies.filter((vacancy) => vacancy.status === "Published").length,
    availableSlots: vacancies
      .filter((vacancy) => vacancy.status === "Published")
      .reduce((sum, vacancy) => sum + Math.max(vacancy.slots - vacancy.filledSlots, 0), 0),
  }), [vacancies])

  const openCreate = () => {
    setEditingVacancy(null)
    setDraft(EMPTY_DRAFT)
    setDialogOpen(true)
  }

  const openEdit = (vacancy: Vacancy) => {
    setEditingVacancy(vacancy)
    setDraft(toDraft(vacancy))
    setDialogOpen(true)
  }

  const saveVacancy = async () => {
    setSaving(true)
    try {
      const response = await authFetch(editingVacancy ? `/api/vacancies/${editingVacancy._id}` : "/api/vacancies", {
        method: editingVacancy ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || "Failed to save vacancy")
      toast.success(draft.status === "Published" ? "Vacancy published" : "Vacancy saved as draft")
      setDialogOpen(false)
      await fetchVacancies()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save vacancy")
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (vacancy: Vacancy, status: VacancyStatus) => {
    try {
      const response = await authFetch(`/api/vacancies/${vacancy._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...toDraft(vacancy), status }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || "Failed to update vacancy")
      toast.success(status === "Published" ? "Vacancy published" : "Vacancy closed")
      await fetchVacancies()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update vacancy")
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 pt-12 md:p-8 md:pt-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-black text-gray-900 md:text-3xl">
            <BriefcaseBusiness className="h-7 w-7 text-[#FFB800]" /> Learner Vacancies
          </h2>
          <p className="mt-1 font-medium text-gray-500">Declare placement opportunities for TVET students in your region.</p>
        </div>
        {isCoordinator ? (
          <Button onClick={openCreate} className="h-12 rounded-2xl bg-[#FFB800] px-6 font-black text-gray-900 hover:bg-[#FFD700]">
            <Plus className="mr-2 h-5 w-5" /> Declare Vacancy
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-sm text-gray-500">Vacancies</p><p className="mt-1 text-3xl font-black">{summary.total}</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-sm text-gray-500">Published</p><p className="mt-1 text-3xl font-black text-emerald-600">{summary.published}</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-5"><p className="text-sm text-gray-500">Open student slots</p><p className="mt-1 text-3xl font-black text-indigo-600">{summary.availableSlots}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["All", "Draft", "Published", "Closed"] as const).map((status) => (
          <Button key={status} variant="outline" onClick={() => setStatusFilter(status)} className={`rounded-xl ${statusFilter === status ? "bg-gray-900 text-white hover:bg-gray-900" : ""}`}>
            {status}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card className="rounded-2xl"><CardContent className="p-10 text-center text-gray-500">Loading vacancies...</CardContent></Card>
      ) : vacancies.length === 0 ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="p-12 text-center"><BriefcaseBusiness className="mx-auto h-12 w-12 text-gray-300" /><p className="mt-3 font-black text-gray-600">No vacancies found</p></CardContent></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {vacancies.map((vacancy) => (
            <Card key={vacancy._id} className="rounded-[2rem] border-gray-100 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div><CardTitle className="text-xl font-black">{vacancy.title}</CardTitle><p className="mt-1 text-sm font-bold text-indigo-600">{vacancy.program}</p></div>
                  <Badge className={STATUS_STYLES[vacancy.status]}>{vacancy.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">{vacancy.description}</p>
                <div className="flex flex-wrap gap-3 text-sm font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {Math.max(vacancy.slots - vacancy.filledSlots, 0)} of {vacancy.slots} slots open</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {vacancy.location || vacancy.region}</span>
                  {vacancy.applicationDeadline ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Apply by {new Date(vacancy.applicationDeadline).toLocaleDateString()}</span> : null}
                </div>
                {isCoordinator ? (
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    {vacancy.status !== "Closed" ? <Button variant="outline" className="rounded-xl" onClick={() => openEdit(vacancy)}><Edit3 className="mr-2 h-4 w-4" /> Edit</Button> : null}
                    {vacancy.status === "Draft" ? <Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void changeStatus(vacancy, "Published")}><Send className="mr-2 h-4 w-4" /> Publish</Button> : null}
                    {vacancy.status === "Published" ? <Button variant="outline" className="rounded-xl border-rose-200 text-rose-700" onClick={() => void changeStatus(vacancy, "Closed")}><XCircle className="mr-2 h-4 w-4" /> Close vacancy</Button> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] bg-white sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingVacancy ? "Edit Student Vacancy" : "Declare Student Vacancy"}</DialogTitle>
            <DialogDescription>Describe the opportunity, required programme or trade, available slots, and placement dates.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label htmlFor="vacancy-title">Vacancy title *</Label><Input id="vacancy-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Industrial attachment opportunity" /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-program">Programme / trade *</Label><Input id="vacancy-program" value={draft.program} onChange={(event) => setDraft((current) => ({ ...current, program: event.target.value }))} placeholder="Electrical Engineering" /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-trade">Specialisation</Label><Input id="vacancy-trade" value={draft.tradeArea} onChange={(event) => setDraft((current) => ({ ...current, tradeArea: event.target.value }))} placeholder="Industrial wiring" /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="vacancy-description">Description *</Label><Textarea id="vacancy-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="vacancy-requirements">Requirements</Label><Textarea id="vacancy-requirements" value={draft.requirements} onChange={(event) => setDraft((current) => ({ ...current, requirements: event.target.value }))} rows={3} placeholder="Year group, skills, PPE, or documents required" /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-slots">Available slots *</Label><Input id="vacancy-slots" type="number" min={1} value={draft.slots} onChange={(event) => setDraft((current) => ({ ...current, slots: Number(event.target.value) }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-deadline">Application deadline</Label><Input id="vacancy-deadline" type="date" value={draft.applicationDeadline} onChange={(event) => setDraft((current) => ({ ...current, applicationDeadline: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-location">Location</Label><Input id="vacancy-location" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-district">District</Label><Input id="vacancy-district" value={draft.district} onChange={(event) => setDraft((current) => ({ ...current, district: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-start">Placement start</Label><Input id="vacancy-start" type="date" value={draft.placementStartDate} onChange={(event) => setDraft((current) => ({ ...current, placementStartDate: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-end">Placement end</Label><Input id="vacancy-end" type="date" value={draft.placementEndDate} onChange={(event) => setDraft((current) => ({ ...current, placementEndDate: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-email">Contact email</Label><Input id="vacancy-email" type="email" value={draft.contactEmail} onChange={(event) => setDraft((current) => ({ ...current, contactEmail: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="vacancy-phone">Contact phone</Label><Input id="vacancy-phone" value={draft.contactPhone} onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Save as</Label><Select value={draft.status} onValueChange={(status: "Draft" | "Published") => setDraft((current) => ({ ...current, status }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Published">Publish now</SelectItem><SelectItem value="Draft">Draft</SelectItem></SelectContent></Select></div>
          </div>
          <div className="flex justify-end gap-3 pt-3"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => void saveVacancy()} disabled={saving} className="bg-[#FFB800] font-black text-gray-900 hover:bg-[#FFD700]">{saving ? "Saving..." : draft.status === "Published" ? "Publish vacancy" : "Save draft"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
