import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BellRing, Settings2, CalendarRange, Save, Plus, Trash2, Loader2, School, ShieldCheck } from "lucide-react"

type SystemSettings = {
  organizationName: string
  supportEmail: string
  supportPhone: string
  defaultPlacementDurationWeeks: number
  attendanceCadenceDays: number
  monitoringVisitCadenceDays: number
  midpointAssessmentOffsetDays: number
  finalAssessmentOffsetDays: number
  employerEvaluationOffsetDays: number
  maintenanceMode: boolean
  allowPlacementMessaging: boolean
  enablePartnerSelfService: boolean
  defaultAcademicYear: string
  timezone: string
}

type NotificationPreferences = {
  inApp: boolean
  email: boolean
  whatsApp: boolean
  systemUpdates: boolean
  placementUpdates: boolean
  supportUpdates: boolean
  visitUpdates: boolean
  assessmentUpdates: boolean
  reportReminders: boolean
  partnerUpdates: boolean
}

type AcademicTerm = {
  _id: string
  name: string
  academicYear: string
  termType: string
  startDate: string
  endDate: string
  status: "Planned" | "Active" | "Completed"
  isCurrent: boolean
  notes: string
  createdBy?: { name: string }
}

type WhatsAppStatus = {
  configured: boolean
  phoneNumberPresent: boolean
  optedIn: boolean
  phoneNumber: string
}

const defaultSystemSettings: SystemSettings = {
  organizationName: "",
  supportEmail: "",
  supportPhone: "",
  defaultPlacementDurationWeeks: 12,
  attendanceCadenceDays: 7,
  monitoringVisitCadenceDays: 30,
  midpointAssessmentOffsetDays: 45,
  finalAssessmentOffsetDays: 0,
  employerEvaluationOffsetDays: 0,
  maintenanceMode: false,
  allowPlacementMessaging: true,
  enablePartnerSelfService: true,
  defaultAcademicYear: "",
  timezone: "Africa/Accra",
}

const defaultNotificationPreferences: NotificationPreferences = {
  inApp: true,
  email: false,
  whatsApp: false,
  systemUpdates: true,
  placementUpdates: true,
  supportUpdates: true,
  visitUpdates: true,
  assessmentUpdates: true,
  reportReminders: true,
  partnerUpdates: true,
}

const defaultTermForm = {
  name: "",
  academicYear: "",
  termType: "Semester 1",
  startDate: "",
  endDate: "",
  status: "Planned",
  isCurrent: false,
  notes: "",
}

const preferenceLabels: Array<{ key: keyof NotificationPreferences; title: string; description: string }> = [
  { key: "inApp", title: "In-app notifications", description: "Show alerts inside the dashboard notification center." },
  { key: "email", title: "Email notifications", description: "Store whether this account wants email delivery when mailers are enabled." },
  { key: "whatsApp", title: "WhatsApp notifications", description: "Send alerts to your account phone number when WhatsApp delivery is configured." },
  { key: "systemUpdates", title: "System updates", description: "Platform-wide updates, maintenance notices, and administrative announcements." },
  { key: "placementUpdates", title: "Placement updates", description: "Placement approvals, status changes, and placement-thread activity." },
  { key: "supportUpdates", title: "Support updates", description: "Replies and status changes for support tickets." },
  { key: "visitUpdates", title: "Monitoring visits", description: "Notifications related to visit submissions and follow-ups." },
  { key: "assessmentUpdates", title: "Assessments", description: "Assessment submissions and related workflow updates." },
  { key: "reportReminders", title: "Report reminders", description: "Semester report reminders and report status changes." },
  { key: "partnerUpdates", title: "Partner updates", description: "Industry partner-related notifications and engagement updates." },
]

export default function SettingsPage() {
  const { authFetch, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [savingSystem, setSavingSystem] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [sendingWhatsAppTest, setSendingWhatsAppTest] = useState(false)
  const [savingTerm, setSavingTerm] = useState(false)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences)
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus>({
    configured: false,
    phoneNumberPresent: false,
    optedIn: false,
    phoneNumber: "",
  })
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [editingTermId, setEditingTermId] = useState<string | null>(null)
  const [termForm, setTermForm] = useState(defaultTermForm)

  const canManageGlobalSettings = user?.role === "SuperAdmin"

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      try {
        const requests = [authFetch("/api/settings/notifications"), authFetch("/api/settings/notifications/whatsapp-status")]
        if (canManageGlobalSettings) {
          requests.push(authFetch("/api/settings/system"), authFetch("/api/academic-terms"))
        }

        const responses = await Promise.all(requests)
        const payloads = await Promise.all(responses.map((res) => res.json()))

        setNotificationPreferences({ ...defaultNotificationPreferences, ...payloads[0] })
        setWhatsAppStatus({
          configured: Boolean(payloads[1]?.configured),
          phoneNumberPresent: Boolean(payloads[1]?.phoneNumberPresent),
          optedIn: Boolean(payloads[1]?.optedIn),
          phoneNumber: payloads[1]?.phoneNumber || "",
        })

        if (canManageGlobalSettings) {
          setSystemSettings({ ...defaultSystemSettings, ...payloads[2] })
          setTerms(payloads[3] || [])
        }
      } catch (error) {
        console.error(error)
        toast.error("Failed to load settings")
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [authFetch, canManageGlobalSettings])

  const saveNotificationPreferences = async () => {
    setSavingPrefs(true)
    try {
      const res = await authFetch("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(notificationPreferences),
      })
      if (!res.ok) throw new Error("Failed to save notification preferences")
      const data = await res.json()
      setNotificationPreferences({ ...defaultNotificationPreferences, ...data })
      setWhatsAppStatus((current) => ({
        ...current,
        optedIn: Boolean(data.whatsApp),
      }))
      toast.success("Notification preferences updated")
    } catch (error) {
      console.error(error)
      toast.error("Failed to save notification preferences")
    } finally {
      setSavingPrefs(false)
    }
  }

  const sendWhatsAppTest = async () => {
    setSendingWhatsAppTest(true)
    try {
      const res = await authFetch("/api/settings/notifications/test-whatsapp", {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "Failed to send WhatsApp test")
      toast.success(data.message || "WhatsApp test message sent")
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to send WhatsApp test")
    } finally {
      setSendingWhatsAppTest(false)
    }
  }

  const saveSystemSettings = async () => {
    setSavingSystem(true)
    try {
      const res = await authFetch("/api/settings/system", {
        method: "PUT",
        body: JSON.stringify({
          ...systemSettings,
          defaultPlacementDurationWeeks: Number(systemSettings.defaultPlacementDurationWeeks),
          attendanceCadenceDays: Number(systemSettings.attendanceCadenceDays),
          monitoringVisitCadenceDays: Number(systemSettings.monitoringVisitCadenceDays),
          midpointAssessmentOffsetDays: Number(systemSettings.midpointAssessmentOffsetDays),
          finalAssessmentOffsetDays: Number(systemSettings.finalAssessmentOffsetDays),
          employerEvaluationOffsetDays: Number(systemSettings.employerEvaluationOffsetDays),
        }),
      })
      if (!res.ok) throw new Error("Failed to save system settings")
      const data = await res.json()
      setSystemSettings({ ...defaultSystemSettings, ...data })
      toast.success("System settings updated")
    } catch (error) {
      console.error(error)
      toast.error("Failed to save system settings")
    } finally {
      setSavingSystem(false)
    }
  }

  const resetTermForm = () => {
    setEditingTermId(null)
    setTermForm(defaultTermForm)
  }

  const saveTerm = async () => {
    setSavingTerm(true)
    try {
      const res = await authFetch(editingTermId ? `/api/academic-terms/${editingTermId}` : "/api/academic-terms", {
        method: editingTermId ? "PUT" : "POST",
        body: JSON.stringify(termForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to save academic term")

      setTerms((current) => {
        if (editingTermId) {
          return current.map((term) => (term._id === editingTermId ? data : data.isCurrent ? { ...term, isCurrent: false } : term))
        }
        const next = data.isCurrent ? current.map((term) => ({ ...term, isCurrent: false })) : current
        return [data, ...next]
      })

      resetTermForm()
      toast.success(editingTermId ? "Academic term updated" : "Academic term created")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save academic term"
      console.error(error)
      toast.error(message)
    } finally {
      setSavingTerm(false)
    }
  }

  const editTerm = (term: AcademicTerm) => {
    setEditingTermId(term._id)
    setTermForm({
      name: term.name,
      academicYear: term.academicYear,
      termType: term.termType,
      startDate: term.startDate.split("T")[0],
      endDate: term.endDate.split("T")[0],
      status: term.status,
      isCurrent: term.isCurrent,
      notes: term.notes || "",
    })
  }

  const deleteTerm = async (termId: string) => {
    try {
      const res = await authFetch(`/api/academic-terms/${termId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete academic term")
      setTerms((current) => current.filter((term) => term._id !== termId))
      if (editingTermId === termId) resetTermForm()
      toast.success("Academic term deleted")
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete academic term")
    }
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-6 pt-16 px-4 md:px-8">
        <Card><CardContent className="py-10 text-center text-gray-500">Loading settings...</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 pt-12 md:pt-16 px-4 md:px-8 pb-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Settings</h2>
          <p className="text-sm font-medium text-gray-500">Manage system configuration, notification preferences, and academic term cycles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100">
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            {user?.role}
          </Badge>
          {canManageGlobalSettings ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Global controls enabled</Badge>
          ) : (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Personal settings only</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-white p-2 shadow-sm border border-gray-100">
          <TabsTrigger value="notifications" className="rounded-xl px-4 py-2.5 font-bold">
            <BellRing className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          {canManageGlobalSettings ? (
            <TabsTrigger value="system" className="rounded-xl px-4 py-2.5 font-bold">
              <Settings2 className="mr-2 h-4 w-4" />
              System Config
            </TabsTrigger>
          ) : null}
          {canManageGlobalSettings ? (
            <TabsTrigger value="terms" className="rounded-xl px-4 py-2.5 font-bold">
              <CalendarRange className="mr-2 h-4 w-4" />
              Academic Terms
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-none shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle className="text-xl font-black">Notification Preferences</CardTitle>
              <CardDescription>Control which alerts appear in your account and which categories remain active.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {preferenceLabels.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-slate-50/60 p-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                  <Checkbox
                    checked={notificationPreferences[item.key]}
                    onCheckedChange={(checked) =>
                      setNotificationPreferences((current) => ({
                        ...current,
                        [item.key]: checked === true,
                      }))
                    }
                    className="mt-1 h-5 w-5 rounded-md"
                  />
                </div>
              ))}

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">WhatsApp Delivery Check</p>
                    <p className="text-sm text-slate-500">
                      Confirm provider setup and send a real test message to {whatsAppStatus.phoneNumberPresent ? whatsAppStatus.phoneNumber : "your saved phone number"}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={whatsAppStatus.configured ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"}>
                      {whatsAppStatus.configured ? "Provider ready" : "Provider not configured"}
                    </Badge>
                    <Badge className={whatsAppStatus.phoneNumberPresent ? "bg-sky-100 text-sky-700 border-sky-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                      {whatsAppStatus.phoneNumberPresent ? "Phone on account" : "Phone missing"}
                    </Badge>
                    <Badge className={whatsAppStatus.optedIn ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                      {whatsAppStatus.optedIn ? "Opted in" : "Opt-in required"}
                    </Badge>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={!whatsAppStatus.configured || !whatsAppStatus.phoneNumberPresent || !whatsAppStatus.optedIn || sendingWhatsAppTest}
                  onClick={sendWhatsAppTest}
                >
                  {sendingWhatsAppTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send Test Message
                </Button>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveNotificationPreferences} disabled={savingPrefs} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  {savingPrefs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageGlobalSettings ? (
          <TabsContent value="system" className="space-y-6">
            <Card className="border-none shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="text-xl font-black">System Configuration</CardTitle>
                <CardDescription>Adjust the platform identity, support contact details, and global workflow defaults.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <Input value={systemSettings.organizationName} onChange={(e) => setSystemSettings((current) => ({ ...current, organizationName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Default Academic Year</Label>
                  <Input value={systemSettings.defaultAcademicYear} onChange={(e) => setSystemSettings((current) => ({ ...current, defaultAcademicYear: e.target.value }))} placeholder="2026/2027" />
                </div>
                <div className="space-y-2">
                  <Label>Support Email</Label>
                  <Input value={systemSettings.supportEmail} onChange={(e) => setSystemSettings((current) => ({ ...current, supportEmail: e.target.value }))} placeholder="support@example.org" />
                </div>
                <div className="space-y-2">
                  <Label>Support Phone</Label>
                  <Input value={systemSettings.supportPhone} onChange={(e) => setSystemSettings((current) => ({ ...current, supportPhone: e.target.value }))} placeholder="+233..." />
                </div>
                <div className="space-y-2">
                  <Label>Default Placement Duration (Weeks)</Label>
                  <Input type="number" min={1} max={52} value={systemSettings.defaultPlacementDurationWeeks} onChange={(e) => setSystemSettings((current) => ({ ...current, defaultPlacementDurationWeeks: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={systemSettings.timezone} onChange={(e) => setSystemSettings((current) => ({ ...current, timezone: e.target.value }))} />
                </div>

                <div className="md:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
                  <div className="mb-4">
                    <p className="font-black text-slate-900">Cadence Rules</p>
                    <p className="text-sm text-slate-500">Control due dates used in active placement management for attendance, visits, assessments, and evaluations.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Attendance Cadence (Days)</Label>
                      <Input type="number" min={1} max={60} value={systemSettings.attendanceCadenceDays} onChange={(e) => setSystemSettings((current) => ({ ...current, attendanceCadenceDays: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Monitoring Visit Cadence (Days)</Label>
                      <Input type="number" min={1} max={120} value={systemSettings.monitoringVisitCadenceDays} onChange={(e) => setSystemSettings((current) => ({ ...current, monitoringVisitCadenceDays: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Midpoint Assessment Offset (Days)</Label>
                      <Input type="number" min={1} max={365} value={systemSettings.midpointAssessmentOffsetDays} onChange={(e) => setSystemSettings((current) => ({ ...current, midpointAssessmentOffsetDays: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Final Assessment Offset From End (Days)</Label>
                      <Input type="number" min={-30} max={30} value={systemSettings.finalAssessmentOffsetDays} onChange={(e) => setSystemSettings((current) => ({ ...current, finalAssessmentOffsetDays: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Employer Evaluation Offset From End (Days)</Label>
                      <Input type="number" min={-30} max={30} value={systemSettings.employerEvaluationOffsetDays} onChange={(e) => setSystemSettings((current) => ({ ...current, employerEvaluationOffsetDays: Number(e.target.value) }))} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: "maintenanceMode", title: "Maintenance mode", description: "Flag the system as under maintenance." },
                    { key: "allowPlacementMessaging", title: "Placement messaging", description: "Keep the placement-thread messaging feature enabled." },
                    { key: "enablePartnerSelfService", title: "Partner self-service", description: "Allow partners to work through their portal flow." },
                  ].map((item) => (
                    <div key={item.key} className="rounded-2xl border border-gray-100 bg-amber-50/40 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-slate-900">{item.title}</p>
                          <p className="text-sm text-slate-500">{item.description}</p>
                        </div>
                        <Checkbox
                          checked={systemSettings[item.key as keyof SystemSettings] as boolean}
                          onCheckedChange={(checked) =>
                            setSystemSettings((current) => ({
                              ...current,
                              [item.key]: checked === true,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={saveSystemSettings} disabled={savingSystem} className="rounded-xl bg-[#FFB800] text-slate-900 hover:bg-[#e5a600]">
                    {savingSystem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save System Config
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canManageGlobalSettings ? (
          <TabsContent value="terms" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
              <Card className="border-none shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
                <CardHeader>
                  <CardTitle className="text-xl font-black">{editingTermId ? "Edit Academic Term" : "Create Academic Term"}</CardTitle>
                  <CardDescription>Define the term window, status, and whether it is the current active cycle.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Term Name</Label>
                    <Input value={termForm.name} onChange={(e) => setTermForm((current) => ({ ...current, name: e.target.value }))} placeholder="2026 Semester One" />
                  </div>
                  <div className="space-y-2">
                    <Label>Academic Year</Label>
                    <Input value={termForm.academicYear} onChange={(e) => setTermForm((current) => ({ ...current, academicYear: e.target.value }))} placeholder="2026/2027" />
                  </div>
                  <div className="space-y-2">
                    <Label>Term Type</Label>
                    <Select value={termForm.termType} onValueChange={(value) => setTermForm((current) => ({ ...current, termType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Term 1">Term 1</SelectItem>
                        <SelectItem value="Term 2">Term 2</SelectItem>
                        <SelectItem value="Term 3">Term 3</SelectItem>
                        <SelectItem value="Semester 1">Semester 1</SelectItem>
                        <SelectItem value="Semester 2">Semester 2</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" value={termForm.startDate} onChange={(e) => setTermForm((current) => ({ ...current, startDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" value={termForm.endDate} onChange={(e) => setTermForm((current) => ({ ...current, endDate: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={termForm.status} onValueChange={(value) => setTermForm((current) => ({ ...current, status: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Planned">Planned</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={termForm.notes} onChange={(e) => setTermForm((current) => ({ ...current, notes: e.target.value }))} className="min-h-[110px]" />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-bold text-slate-900">Mark as current term</p>
                      <p className="text-sm text-slate-500">Only one term can be current at a time.</p>
                    </div>
                    <Checkbox checked={termForm.isCurrent} onCheckedChange={(checked) => setTermForm((current) => ({ ...current, isCurrent: checked === true }))} />
                  </div>
                  <div className="flex justify-between gap-3">
                    <Button variant="outline" onClick={resetTermForm} className="rounded-xl">Clear</Button>
                    <Button onClick={saveTerm} disabled={savingTerm} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                      {savingTerm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingTermId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                      {editingTermId ? "Update Term" : "Create Term"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
                <CardHeader>
                  <CardTitle className="text-xl font-black">Academic Terms</CardTitle>
                  <CardDescription>Track active and upcoming academic cycles used across the platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {terms.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                      <School className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                      <p className="font-bold text-slate-700">No academic terms created yet</p>
                    </div>
                  ) : (
                    terms.map((term) => (
                      <div key={term._id} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-black text-slate-900">{term.name}</p>
                              <Badge className={term.isCurrent ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100"}>
                                {term.isCurrent ? "Current" : term.status}
                              </Badge>
                              <Badge variant="outline">{term.termType}</Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-500">{term.academicYear} · {new Date(term.startDate).toLocaleDateString()} to {new Date(term.endDate).toLocaleDateString()}</p>
                            {term.notes ? <p className="text-sm text-slate-600">{term.notes}</p> : null}
                            {term.createdBy?.name ? <p className="text-xs uppercase tracking-wide text-slate-400">Created by {term.createdBy.name}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => editTerm(term)} className="rounded-xl">Edit</Button>
                            <Button variant="outline" onClick={() => deleteTerm(term._id)} className="rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
