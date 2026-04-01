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
  'Other': '#6B7280',
}

const eventTypeIcons: Record<string, typeof Calendar> = {
  'Semester Start': BookOpen,
  'Semester End': GraduationCap,
  'Exam Period': AlertTriangle,
  'Holiday': Palmtree,
  'Deadline': Clock,
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
}

export default function AcademicCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<AcademicEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AcademicEvent | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { authFetch } = useAuth()

  const fetchEvents = async () => {
    try {
      const res = await authFetch('/api/academic-calendar')
      const data = await res.json()
      setEvents(data)
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
    setSaving(true)
    try {
      const url = editing
        ? `/api/academic-calendar/${editing._id}`
        : '/api/academic-calendar'
      const method = editing ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
                          onClick={() => handleEdit(event)}
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
                      <div key={event._id} className="relative pl-6 group">
                        <div className="absolute left-0 top-1 bottom-1 w-1 rounded-full group-hover:w-1.5 transition-all" style={{ backgroundColor: color }} />
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {format(new Date(event.startDate), 'EEE, MMM d')} – {format(new Date(event.endDate), 'MMM d')}
                        </div>
                        <div className="font-black text-gray-900 text-sm mt-0.5 leading-tight">{event.title}</div>
                        <Badge className="mt-1 border-0 text-[9px] font-black rounded-md" style={{ backgroundColor: `${color}20`, color }}>
                          {event.eventType}
                        </Badge>
                      </div>
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
                        <div className="min-w-0">
                          <div className="text-sm font-black text-gray-900 truncate">{event.title}</div>
                          <div className="text-[10px] text-gray-400 font-bold">
                            {format(new Date(event.startDate), 'MMM d')} – {format(new Date(event.endDate), 'MMM d, yyyy')}
                          </div>
                        </div>
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
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{editing ? 'Edit Event' : 'Add Academic Event'}</DialogTitle>
            <DialogDescription className="text-gray-400">
              This event will be visible to all institutions on their calendars.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-bold text-white block mb-1">Title *</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                placeholder="e.g. Semester 1 Begins"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-white block mb-1">Description</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 resize-none"
                rows={2}
                placeholder="Optional details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-white block mb-1">Event Type</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                value={formData.eventType}
                onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
              >
                <option value="Semester Start">Semester Start</option>
                <option value="Semester End">Semester End</option>
                <option value="Exam Period">Exam Period</option>
                <option value="Holiday">Holiday</option>
                <option value="Deadline">Deadline</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-white block mb-1">Start Date *</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-white block mb-1">End Date *</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-white block mb-1">Semester</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  value={formData.semester}
                  onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-white block mb-1">Academic Year</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50"
                  placeholder="e.g. 2025/2026"
                  value={formData.academicYear}
                  onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setFormData(emptyForm) }} className="rounded-xl">
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
