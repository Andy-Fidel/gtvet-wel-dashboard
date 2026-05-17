
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
  isWithinInterval,
} from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  Video,
  GraduationCap,
  FileText,
  Clock,
  BookOpen,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  type: 'completion' | 'visit' | 'report' | 'academic'
  eventType?: string
  learnerName?: string
  description?: string
  color: string
}

type EventTypeFilter = 'all' | 'completion' | 'visit' | 'academic'

const MAX_VISIBLE_EVENTS = 2

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [previewEvent, setPreviewEvent] = useState<CalendarEvent | null>(null)
  const [dayOverflowEvents, setDayOverflowEvents] = useState<CalendarEvent[] | null>(null)
  const [dayOverflowDate, setDayOverflowDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>('all')
  const { authFetch } = useAuth()

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    })

    setLoading(true)
    authFetch(`/api/calendar/events?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.message || `Server responded with ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setEvents(Array.isArray(data) ? data : [])
      })
      .catch(err => {
        if (cancelled) return
        console.error("Error fetching calendar events:", err)
        toast.error(err instanceof Error ? err.message : "Failed to load calendar events")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authFetch, currentMonth])

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate
  })

  const filteredEvents = typeFilter === 'all'
    ? events
    : events.filter(e => e.type === typeFilter)

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter((event) => {
      const start = new Date(event.start)
      const end = event.end ? new Date(event.end) : start
      return isSameDay(start, day) || isSameDay(end, day) || isWithinInterval(day, { start, end })
    })
  }

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const goToToday = () => setCurrentMonth(new Date())

  const isCurrentMonthToday = isSameMonth(currentMonth, new Date())

  const upcomingEvents = filteredEvents
    .filter(e => new Date(e.start) >= new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)

  const eventTypeLabel = (type: CalendarEvent["type"]) => {
    if (type === "completion") return "Completion"
    if (type === "visit") return "Monitoring Visit"
    if (type === "report") return "Report Deadline"
    return "Academic Event"
  }

  const filterChips: { label: string; value: EventTypeFilter; color: string }[] = [
    { label: "All", value: "all", color: "#6B7280" },
    { label: "Completions", value: "completion", color: "#10B981" },
    { label: "Visits", value: "visit", color: "#3B82F6" },
    { label: "Academic", value: "academic", color: "#8B5CF6" },
  ]

  return (
    <div className="flex-1 space-y-6 p-8 max-w-7xl mx-auto w-full">
      {/* Event Preview Dialog */}
      <Dialog open={Boolean(previewEvent)} onOpenChange={(open) => { if (!open) setPreviewEvent(null) }}>
        <DialogContent className="sm:max-w-[680px] rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Calendar Event Preview</DialogTitle>
            <DialogDescription>Read-only event details for the selected calendar item.</DialogDescription>
          </DialogHeader>
          {previewEvent ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge style={{ backgroundColor: `${previewEvent.color}20`, color: previewEvent.color, borderColor: `${previewEvent.color}40` }} className="border font-bold">
                  {previewEvent.type === "academic" && previewEvent.eventType ? previewEvent.eventType : eventTypeLabel(previewEvent.type)}
                </Badge>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 font-bold">
                  {format(new Date(previewEvent.start), "PP")}
                  {previewEvent.end ? ` – ${format(new Date(previewEvent.end), "PP")}` : ""}
                </Badge>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Title</p>
                <p className="mt-2 text-base font-bold text-gray-900">{previewEvent.title}</p>
              </div>
              {previewEvent.type === "completion" && previewEvent.learnerName ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-600">Learner</p>
                  <p className="mt-2 text-base font-bold text-emerald-900">{previewEvent.learnerName}</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Description</p>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{previewEvent.description || "No description provided."}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Day Overflow Dialog */}
      <Dialog open={Boolean(dayOverflowEvents)} onOpenChange={(open) => { if (!open) { setDayOverflowEvents(null); setDayOverflowDate(null) } }}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{dayOverflowDate ? format(dayOverflowDate, 'EEEE, MMMM d, yyyy') : 'Events'}</DialogTitle>
            <DialogDescription>{dayOverflowEvents?.length || 0} events on this day</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {dayOverflowEvents?.map(event => (
              <button
                key={event.id}
                type="button"
                className="w-full text-left p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3"
                onClick={() => { setDayOverflowEvents(null); setDayOverflowDate(null); setPreviewEvent(event) }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{event.title}</p>
                  <p className="text-xs text-gray-500 truncate">{event.description}</p>
                </div>
                <Badge style={{ backgroundColor: `${event.color}15`, color: event.color }} className="text-[10px] font-bold border-0 shrink-0">
                  {eventTypeLabel(event.type)}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <CalendarDays className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Calendar
          </h2>
          <p className="text-gray-500 font-bold mt-1 uppercase tracking-wider text-xs">
            Tracking completions, visits and deadlines
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Event Type Filters */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
            {filterChips.map(chip => (
              <button
                key={chip.value}
                onClick={() => setTypeFilter(chip.value)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  typeFilter === chip.value
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
                style={typeFilter === chip.value ? { backgroundColor: chip.color } : undefined}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {/* Month Navigation */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-gray-100 shadow-sm">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-lg h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 font-black text-gray-900 min-w-28 text-center text-sm uppercase tracking-tight">
              {format(currentMonth, 'MMM yyyy')}
            </div>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-lg h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentMonthToday && (
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className="rounded-lg text-xs font-bold border-gray-200 ml-1"
              >
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Calendar Grid */}
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl shadow-xl p-4 md:p-8">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {[...Array(7)].map((_, i) => (
                  <Skeleton key={i} className="h-4 rounded" />
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px rounded-2xl overflow-hidden">
                {[...Array(35)].map((_, i) => (
                  <Skeleton key={i} className="h-[100px] md:h-[140px] rounded-none" />
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[600px] md:min-w-0">
                <div className="grid grid-cols-7 mb-4">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-50 border border-gray-50 rounded-2xl md:rounded-3xl overflow-hidden shadow-inner font-bold">
                  {calendarDays.map((day, idx) => {
                    const dayEvents = getEventsForDay(day)
                    const isCurrentMonth = isSameMonth(day, monthStart)
                    const isToday = isSameDay(day, new Date())
                    const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
                    const overflowCount = dayEvents.length - MAX_VISIBLE_EVENTS

                    return (
                      <div
                        key={idx}
                        className={`min-h-[100px] md:min-h-[140px] bg-white p-2 md:p-3 transition-all hover:bg-gray-50 group relative
                          ${!isCurrentMonth ? 'bg-gray-50/50' : ''}
                        `}
                      >
                        <div className={`
                          text-xs md:text-sm font-black mb-1 md:mb-2 flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl transition-all
                          ${isToday ? 'bg-[#FFB800] text-gray-900 shadow-lg' : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}
                        `}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-1">
                          {visibleEvents.map(event => (
                            <div
                              key={event.id}
                              className="text-[9px] md:text-[10px] p-1 md:p-1.5 rounded-lg md:rounded-xl border border-transparent hover:border-gray-100 transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 overflow-hidden"
                              style={{ backgroundColor: `${event.color}15`, color: event.color }}
                              title={event.description}
                              onClick={() => setPreviewEvent(event)}
                            >
                              {event.type === 'visit' && <Video className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                              {event.type === 'completion' && <GraduationCap className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                              {event.type === 'report' && <FileText className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                              {event.type === 'academic' && <BookOpen className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                              <span className="truncate font-black uppercase tracking-tight">{event.title}</span>
                            </div>
                          ))}
                          {overflowCount > 0 && (
                            <button
                              type="button"
                              onClick={() => { setDayOverflowEvents(dayEvents); setDayOverflowDate(day) }}
                              className="w-full text-[9px] md:text-[10px] text-gray-500 hover:text-gray-700 font-black py-0.5 rounded-lg hover:bg-gray-100 transition-colors text-center"
                            >
                              +{overflowCount} more
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="bg-white border-gray-100 rounded-2xl shadow-xl overflow-hidden border-0">
             <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#FFB800]" />
                  Upcoming
                </CardTitle>
             </CardHeader>
             <CardContent className="p-8 pt-0">
                <div className="space-y-6">
                  {loading ? (
                    [...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="w-1 h-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-20 rounded" />
                          <Skeleton className="h-4 w-full rounded" />
                        </div>
                      </div>
                    ))
                  ) : upcomingEvents.length === 0 ? (
                    <div className="text-center py-4">
                      <CalendarDays className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm font-bold text-gray-400">No upcoming events</p>
                      <p className="text-xs text-gray-400 mt-1">Events will appear here as they're scheduled.</p>
                    </div>
                  ) : (
                    upcomingEvents.map(event => (
                      <button key={event.id} type="button" className="relative pl-6 group text-left w-full" onClick={() => setPreviewEvent(event)}>
                        <div className="absolute left-0 top-1 bottom-1 w-1 rounded-full group-hover:w-1.5 transition-all" style={{ backgroundColor: event.color }} />
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {format(new Date(event.start), 'EEE, MMM d')}
                        </div>
                        <div className="font-black text-gray-900 text-sm mt-0.5 leading-tight">{event.title}</div>
                        <div className="text-xs font-bold text-gray-500 mt-1 line-clamp-1">{event.description}</div>
                      </button>
                    ))
                  )}
                </div>
             </CardContent>
          </Card>

          <Card className="bg-[#111827] rounded-2xl shadow-2xl p-8 border-0">
             <h3 className="text-white font-black text-xl mb-6">Workflow Legend</h3>
             <div className="space-y-4">
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-2xl bg-[#10B981]/20 flex items-center justify-center text-[#10B981] group-hover:scale-110 transition-transform">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-black">Learner Completions</div>
                    <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">End of training</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6] group-hover:scale-110 transition-transform">
                    <Video className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-black">Monitoring Visits</div>
                    <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Supervisor schedules</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-2xl bg-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B] group-hover:scale-110 transition-transform">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-black">Report Deadlines</div>
                    <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Semester submissions</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-2xl bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6] group-hover:scale-110 transition-transform">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-black">Academic Events</div>
                    <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">HQ semester calendar</div>
                  </div>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
