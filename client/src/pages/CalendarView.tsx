
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
  subMonths 
} from "date-fns"
import { 
  ChevronLeft, 
  ChevronRight, 
  Video, 
  GraduationCap, 
  FileText,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"

interface CalendarEvent {
  id: string
  title: string
  start: string
  type: 'completion' | 'visit' | 'report'
  description?: string
  color: string
}

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const { authFetch } = useAuth()

  useEffect(() => {
    authFetch('http://localhost:5001/api/calendar/events')
      .then(res => res.json())
      .then(data => {
        setEvents(data)
      })
      .catch(err => {
        console.error("Error fetching calendar events:", err)
      })
  }, [authFetch])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate
  })

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(new Date(event.start), day))
  }

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  const upcomingEvents = events
    .filter(e => new Date(e.start) >= new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)

  return (
    <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Calendar</h2>
          <p className="text-gray-500 font-bold mt-1 uppercase tracking-wider text-xs">
            Tracking completions, visits and deadlines
          </p>
        </div>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Calendar Grid */}
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl p-4 md:p-8">
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
                      {dayEvents.map(event => (
                        <div 
                          key={event.id}
                          className="text-[9px] md:text-[10px] p-1 md:p-2 rounded-lg md:rounded-xl border border-transparent hover:border-gray-100 transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 overflow-hidden"
                          style={{ backgroundColor: `${event.color}15`, color: event.color }}
                          title={event.description}
                        >
                          {event.type === 'visit' && <Video className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                          {event.type === 'completion' && <GraduationCap className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                          {event.type === 'report' && <FileText className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />}
                          <span className="truncate font-black uppercase tracking-tight">{event.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="lg:hidden mt-4 text-center">
             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">Swipe left to see full schedule</p>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden border-0">
             <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#FFB800]" />
                  Upcoming
                </CardTitle>
             </CardHeader>
             <CardContent className="p-8 pt-0">
                <div className="space-y-6">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm text-gray-400 font-bold italic">No upcoming events found</p>
                  ) : (
                    upcomingEvents.map(event => (
                      <div key={event.id} className="relative pl-6 group">
                        <div className="absolute left-0 top-1 bottom-1 w-1 rounded-full group-hover:w-1.5 transition-all" style={{ backgroundColor: event.color }} />
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {format(new Date(event.start), 'EEE, MMM d')}
                        </div>
                        <div className="font-black text-gray-900 text-sm mt-0.5 leading-tight">{event.title}</div>
                        <div className="text-xs font-bold text-gray-500 mt-1 line-clamp-1">{event.description}</div>
                      </div>
                    ))
                  )}
                </div>
             </CardContent>
          </Card>

          <Card className="bg-[#111827] rounded-[2rem] shadow-2xl p-8 border-0">
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
                    <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Monthly GTVET submission</div>
                  </div>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
