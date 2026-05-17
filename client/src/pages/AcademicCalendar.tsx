import { useState, useEffect } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isWithinInterval
} from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  GraduationCap,
  Clock,
  AlertTriangle,
  BookOpen,
  Palmtree,
  BriefcaseBusiness,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

interface AcademicEvent {
  _id: string
  title: string
  description: string
  startDate: string
  endDate: string
  eventType: string
  semester: string
  academicYear: string
  institutionCalendarType?: string
  targetYearGroup?: string
  totalWeeks?: number | null
  hoursPerDay?: number | null
  sourceLabel?: string
  isActive: boolean
  createdBy: { _id: string; name: string }
  createdAt: string
}

const eventTypeColors: Record<string, string> = {
  'Semester Start': '#8B5CF6',
  'Semester End': '#EC4899',
  'Exam Period': '#EF4444',
  'Holiday': '#10B981',
  'Deadline': '#F59E0B',
  'WEL Window': '#2563EB',
  'Other': '#6B7280',
}

const eventTypeIcons: Record<string, typeof Calendar> = {
  'Semester Start': BookOpen,
  'Semester End': GraduationCap,
  'Exam Period': AlertTriangle,
  'Holiday': Palmtree,
  'Deadline': Clock,
  'WEL Window': BriefcaseBusiness,
  'Other': Calendar,
}

const emptyForm = {
  title: '',
  description: '',
  startDate: '',
  endDate: '',
  eventType: 'Other',
  semester: '',
  academicYear: '',
  institutionCalendarType: 'All',
  targetYearGroup: 'All',
  totalWeeks: '',
  hoursPerDay: '5',
  sourceLabel: '',
  isActive: true,
}

const semesterOptions = ['Semester 1', 'Semester 2']
const eventTypeOptions = ['Semester Start', 'Semester End', 'Exam Period', 'Holiday', 'Deadline', 'WEL Window', 'Other']
const calendarTypeOptions = ['Single Track', 'Transitional']
const yearGroupOptions = ['Year 1', 'Year 2', 'Year 3']

const buildWelWindowTitle = (formData: typeof emptyForm) => {
  if (formData.institutionCalendarType === 'All' || formData.targetYearGroup === 'All') return ''
  return `${formData.institutionCalendarType} ${formData.targetYearGroup} WEL Window`
}

export default function AcademicCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<AcademicEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AcademicEvent | null>(null)
  const [previewEvent, setPreviewEvent] = useState<AcademicEvent | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { authFetch } = useAuth()

  const fetchEvents = async () => {
    try {
      const res = await authFetch('/api/academic-calendar')
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Error fetching academic calendar:", err)
    }
  }

  useEffect(() => {
    fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch])

  const handleSave = async () => {
    if (!formData.title || !formData.startDate || !formData.endDate) {
      toast.error("Title, start date, and end date are required")
      return
    }
    if (formData.eventType === 'WEL Window') {
      if (!formData.semester || !formData.academicYear || formData.institutionCalendarType === 'All' || formData.targetYearGroup === 'All') {
        toast.error("WEL windows require semester, academic year, calendar type, and target year group")
        return
      }
    }
    setSaving(true)
    try {
      const url = editing
        ? `/api/academic-calendar/${editing._id}`
        : '/api/academic-calendar'
      const method = editing ? 'PUT' : 'POST'
      const payload = {
        ...formData,
        totalWeeks: formData.totalWeeks ? Number(formData.totalWeeks) : null,
        hoursPerDay: formData.hoursPerDay ? Number(formData.hoursPerDay) : null,
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editing ? "Event updated!" : "Event created!")
        setShowForm(false)
        setEditing(null)
        setFormData(emptyForm)
        fetchEvents()
      } else {
        const err = await res.json()
        toast.error(err.message || "Failed to save event")
      }
    } catch {
      toast.error("Failed to save event")
    } finally {
      setSaving(false)
    }
  }

  const handleSeedTemplate = async () => {
    try {
      const res = await authFetch('/api/academic-calendar/bootstrap-wel-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: '2025/2026' }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.message || 'Failed to seed WEL template')
      toast.success(payload.message || 'WEL template loaded')
      fetchEvents()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to seed WEL template')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/academic-calendar/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success("Event deleted")
        fetchEvents()
      }
    } catch {
      toast.error("Failed to delete event")
    }
  }

  const handleEdit = (event: AcademicEvent) => {
    setEditing(event)
    setFormData({
      title: event.title,
      description: event.description || '',
      startDate: event.startDate?.split('T')[0] || '',
      endDate: event.endDate?.split('T')[0] || '',
      eventType: event.eventType,
      semester: event.semester || '',
      academicYear: event.academicYear || '',
      institutionCalendarType: event.institutionCalendarType || 'All',
      targetYearGroup: event.targetYearGroup || 'All',
      totalWeeks: event.totalWeeks ? String(event.totalWeeks) : '',
      hoursPerDay: event.hoursPerDay ? String(event.hoursPerDay) : '5',
      sourceLabel: event.sourceLabel || '',
      isActive: event.isActive ?? true,
    })
    setShowForm(true)
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

  const getEventsForDay = (day: Date) => {
    return events.filter(event => {
      const s = new Date(event.startDate)
      const e = new Date(event.endDate)
      return isSameDay(s, day) || isSameDay(e, day) || isWithinInterval(day, { start: s, end: e })
    })
  }

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  const upcomingEvents = events
    .filter(e => new Date(e.startDate) >= new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 6)

  return (
    <div className="flex-1 space-y-6">
      <Dialog open={Boolean(previewEvent)} onOpenChange={(open) => { if (!open) setPreviewEvent(null) }}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Academic Event Preview</DialogTitle>
            <DialogDescription className="text-gray-500">Read-only event details with quick management actions.</DialogDescription>
          </DialogHeader>
          {previewEvent ? (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-0" style={{ backgroundColor: `${eventTypeColors[previewEvent.eventType] || '#6B7280'}20`, color: eventTypeColors[previewEvent.eventType] || '#6B7280' }}>
                  {previewEvent.eventType}
                </Badge>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{format(new Date(previewEvent.startDate), 'PP')} – {format(new Date(previewEvent.endDate), 'PP')}</Badge>
                {previewEvent.semester ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{previewEvent.semester}</Badge> : null}
                {previewEvent.academicYear ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{previewEvent.academicYear}</Badge> : null}
                {previewEvent.eventType === 'WEL Window' && previewEvent.targetYearGroup ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{previewEvent.targetYearGroup}</Badge> : null}
                {previewEvent.eventType === 'WEL Window' && previewEvent.institutionCalendarType ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">{previewEvent.institutionCalendarType}</Badge> : null}
                <Badge className={previewEvent.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'}>
                  {previewEvent.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Title</p>
                <p className="mt-2 text-base font-bold text-gray-900">{previewEvent.title}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Description</p>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{previewEvent.description || 'No description provided.'}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Created By</p>
                <p className="mt-2 text-sm text-gray-700">{previewEvent.createdBy?.name || 'Unknown'} · {format(new Date(previewEvent.createdAt), 'PPp')}</p>
              </div>
              {previewEvent.eventType === 'WEL Window' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">WEL Duration</p>
                    <p className="mt-2 text-sm font-bold text-blue-900">{previewEvent.totalWeeks || 'N/A'} week(s)</p>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">Hours Per Day</p>
                    <p className="mt-2 text-sm font-bold text-blue-900">{previewEvent.hoursPerDay || 'N/A'} hour(s)</p>
                  </div>
                </div>
              ) : null}
              <DialogFooter>
                <Button variant="outline" className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => { setPreviewEvent(null); handleEdit(previewEvent) }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Event
                </Button>
                <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={() => { setPreviewEvent(null); handleDelete(previewEvent._id) }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Event
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Academic Calendar</h2>
          <p className="text-gray-500 font-bold mt-1 uppercase tracking-wider text-xs">
            Define semesters, deadlines, and key dates for all institutions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-xl h-10 w-10">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="px-4 font-black text-gray-900 min-w-32 text-center uppercase tracking-tighter">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-xl h-10 w-10">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <Button
            onClick={() => { setEditing(null); setFormData(emptyForm); setShowForm(true) }}
            className="rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Event
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSeedTemplate}
            className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-bold"
          >
            <BriefcaseBusiness className="h-4 w-4 mr-2" /> Load 2025/2026 WEL Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-[2.5rem] shadow-xl p-8">
          <div className="grid grid-cols-7 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-50 border border-gray-50 rounded-3xl overflow-hidden shadow-inner font-bold">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day)
              const isCurrentMonth = isSameMonth(day, monthStart)
              const isToday = isSameDay(day, new Date())

              return (
                <div
                  key={idx}
                  className={`min-h-[130px] bg-white p-3 transition-all hover:bg-gray-50 group relative
                    ${!isCurrentMonth ? 'bg-gray-50/50' : ''}
                  `}
                >
                  <div className={`
                    text-sm font-black mb-2 flex items-center justify-center w-8 h-8 rounded-xl transition-all
                    ${isToday ? 'bg-[#FFB800] text-gray-900 shadow-lg' : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}
                  `}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => {
                      const color = eventTypeColors[event.eventType] || '#6B7280'
                      return (
                        <div
                          key={event._id}
                          className="text-[10px] p-1.5 rounded-xl border border-transparent hover:border-gray-100 transition-all cursor-pointer flex items-center gap-1.5 overflow-hidden"
                          style={{ backgroundColor: `${color}15`, color }}
                          title={`${event.title} — ${event.description}`}
                          onClick={() => setPreviewEvent(event)}
                        >
                          <span className="truncate font-black uppercase tracking-tight">{event.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-gray-400 font-bold pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden border-0">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#FFB800]" />
                Upcoming Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              <div className="space-y-5 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 font-bold italic">No upcoming events</p>
                ) : (
                  upcomingEvents.map(event => {
                    const color = eventTypeColors[event.eventType] || '#6B7280'
                    return (
                      <button key={event._id} type="button" className="relative pl-6 group text-left w-full" onClick={() => setPreviewEvent(event)}>
                        <div className="absolute left-0 top-1 bottom-1 w-1 rounded-full group-hover:w-1.5 transition-all" style={{ backgroundColor: color }} />
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {format(new Date(event.startDate), 'EEE, MMM d')} – {format(new Date(event.endDate), 'MMM d')}
                        </div>
                        <div className="font-black text-gray-900 text-sm mt-0.5 leading-tight">{event.title}</div>
                        <Badge className="mt-1 border-0 text-[9px] font-black rounded-md" style={{ backgroundColor: `${color}20`, color }}>
                          {event.eventType}
                        </Badge>
                      </button>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Event Types Legend */}
          <Card className="bg-[#111827] rounded-[2rem] shadow-2xl p-8 border-0">
            <h3 className="text-white font-black text-xl mb-6">Event Types</h3>
            <div className="space-y-4">
              {Object.entries(eventTypeColors).map(([type, color]) => {
                const Icon = eventTypeIcons[type] || Calendar
                return (
                  <div key={type} className="flex items-center gap-4 group">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform" style={{ backgroundColor: `${color}30`, color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-white text-sm font-black">{type}</div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* All Events List */}
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden border-0">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-black">All Events</CardTitle>
              <CardDescription className="text-gray-400 font-bold text-xs">{events.length} events defined</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {events.map(event => {
                  const color = eventTypeColors[event.eventType] || '#6B7280'
                  return (
                    <div key={event._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <button type="button" className="min-w-0 text-left" onClick={() => setPreviewEvent(event)}>
                          <div className="text-sm font-black text-gray-900 truncate">{event.title}</div>
                          <div className="text-[10px] text-gray-400 font-bold">
                            {format(new Date(event.startDate), 'MMM d')} – {format(new Date(event.endDate), 'MMM d, yyyy')}
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => handleEdit(event)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600" onClick={() => handleDelete(event._id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) { setEditing(null); setFormData(emptyForm) } }}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{editing ? 'Edit Event' : 'Add Academic Event'}</DialogTitle>
            <DialogDescription className="text-gray-400">
              General events appear system-wide. WEL windows can be targeted to a calendar type and year group.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(90vh-9rem)] grid-cols-1 gap-6 overflow-y-auto py-4 pr-2 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-5">
              {formData.eventType === 'WEL Window' ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-blue-700">WEL Template Mode</p>
                  <p className="mt-2 text-sm text-blue-900">
                    This event will drive placement eligibility for a specific institution calendar type and year group. Use it for future academic-cycle templates, not generic reminders.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-bold text-white">Title *</label>
                    {formData.eventType === 'WEL Window' ? (
                      <button
                        type="button"
                        className="text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          const generated = buildWelWindowTitle(formData)
                          if (generated) setFormData({ ...formData, title: generated })
                        }}
                      >
                        Generate from WEL fields
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    placeholder={formData.eventType === 'WEL Window' ? 'e.g. Single Track Year 2 WEL Window' : 'e.g. Semester 1 Begins'}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-white">
                    Use a clear operational title that staff can recognize quickly in calendar views and previews.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-bold text-white block mb-1">Description</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 resize-none"
                    rows={3}
                    placeholder={formData.eventType === 'WEL Window' ? 'Explain the source, assumptions, or policy note for this WEL window.' : 'Optional details...'}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-white">
                    Add context that explains how this event should be interpreted or used by institutions.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">Event Type</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                  >
                    {eventTypeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs font-medium text-white">
                    Choose <span className="font-bold text-white">WEL Window</span> only for cohort schedules that should control placement eligibility.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">Status</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    value={formData.isActive ? 'Active' : 'Inactive'}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'Active' })}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <p className="mt-2 text-xs font-medium text-white">
                    Inactive templates remain on record but stop driving operational scheduling.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">Start Date *</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-white">
                    The first day the event or WEL window becomes operational.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">End Date *</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-white">
                    The last day covered by this event or cohort window.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">Semester</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {semesterOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs font-medium text-white">
                    Link the event to the semester it belongs to for filtering and reporting.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-bold text-white block mb-1">Academic Year</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                    placeholder="e.g. 2026/2027"
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-white">
                    Use the academic cycle format the system already uses, for example <span className="font-bold text-white">2026/2027</span>.
                  </p>
                </div>
              </div>

              {formData.eventType === 'WEL Window' ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">WEL Targeting</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">Institution Calendar Type</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                        value={formData.institutionCalendarType}
                        onChange={(e) => setFormData({ ...formData, institutionCalendarType: e.target.value })}
                      >
                        <option value="All">Select...</option>
                        {calendarTypeOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Match the institution academic-calendar model so only the correct schools see and use this window.
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">Target Year Group</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                        value={formData.targetYearGroup}
                        onChange={(e) => setFormData({ ...formData, targetYearGroup: e.target.value })}
                      >
                        <option value="All">Select...</option>
                        {yearGroupOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Only learners in this year group will be considered eligible during this WEL window.
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">Total Weeks</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                        value={formData.totalWeeks}
                        onChange={(e) => setFormData({ ...formData, totalWeeks: e.target.value })}
                      />
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Record the planned WEL duration from the approved academic calendar.
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">Hours Per Day</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                        value={formData.hoursPerDay}
                        onChange={(e) => setFormData({ ...formData, hoursPerDay: e.target.value })}
                      />
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Use the expected daily instructional or workplace-contact hours for the cohort.
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-bold text-gray-700 block mb-1">Source Label</label>
                      <input
                        type="text"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                        value={formData.sourceLabel}
                        onChange={(e) => setFormData({ ...formData, sourceLabel: e.target.value })}
                        placeholder="e.g. Revised 2025/2026 Academic Calendar"
                      />
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Capture the document or policy source used to create this template so future edits are traceable.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Template Preview</p>
                <p className="mt-3 text-lg font-black text-gray-900">
                  {formData.title || (formData.eventType === 'WEL Window' ? buildWelWindowTitle(formData) || 'Untitled WEL window' : 'Untitled event')}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge className="border-0" style={{ backgroundColor: `${eventTypeColors[formData.eventType] || '#6B7280'}20`, color: eventTypeColors[formData.eventType] || '#6B7280' }}>
                    {formData.eventType}
                  </Badge>
                  {formData.semester ? <Badge variant="outline">{formData.semester}</Badge> : null}
                  {formData.academicYear ? <Badge variant="outline">{formData.academicYear}</Badge> : null}
                  {formData.eventType === 'WEL Window' && formData.targetYearGroup !== 'All' ? <Badge variant="outline">{formData.targetYearGroup}</Badge> : null}
                  {formData.eventType === 'WEL Window' && formData.institutionCalendarType !== 'All' ? <Badge variant="outline">{formData.institutionCalendarType}</Badge> : null}
                  <Badge className={formData.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'}>
                    {formData.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <p>{formData.startDate || 'Start date not set'}{formData.endDate ? ` to ${formData.endDate}` : ''}</p>
                  {formData.eventType === 'WEL Window' ? (
                    <>
                      <p>{formData.totalWeeks || 'N/A'} week(s) planned at {formData.hoursPerDay || 'N/A'} hour(s) per day.</p>
                      <p>{formData.sourceLabel || 'No source label captured yet.'}</p>
                    </>
                  ) : (
                    <p>{formData.description || 'No description captured yet.'}</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Authoring Notes</p>
                <div className="mt-3 space-y-2 text-sm text-amber-900">
                  <p>Use `WEL Window` only for cohort schedules that should control learner placement eligibility.</p>
                  <p>Use generic event types for deadlines, semester markers, holidays, and reporting reminders.</p>
                  <p>Set inactive instead of deleting if you need to preserve a previous template but stop using it.</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setFormData(emptyForm) }} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-[#FFB800] text-black hover:bg-[#e5a600] font-bold">
              {saving ? 'Saving...' : editing ? 'Update Event' : 'Create Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
