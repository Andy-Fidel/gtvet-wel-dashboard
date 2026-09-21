import { isHQRole } from '@/lib/rbac'
import { useCallback, useEffect, useMemo, useState } from "react"
import { BriefcaseBusiness, CalendarClock, Mail, MapPin, Phone, Search, Users } from "lucide-react"
import { toast } from "@/lib/toast"
import { useAuth } from "@/context/AuthContext"
import type { Vacancy } from "@/types/models"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function Vacancies() {
  const { authFetch, user } = useAuth()
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const fetchVacancies = useCallback(async () => {
    try {
      const response = await authFetch("/api/vacancies")
      const payload = await response.json().catch(() => [])
      if (!response.ok) throw new Error(payload.message || "Failed to load vacancies")
      setVacancies(Array.isArray(payload) ? payload : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load vacancies")
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    void fetchVacancies()
  }, [fetchVacancies])

  const filteredVacancies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return vacancies
    return vacancies.filter((vacancy) => [
      vacancy.title,
      vacancy.program,
      vacancy.tradeArea,
      vacancy.partner?.name,
      vacancy.region,
      vacancy.location,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)))
  }, [query, vacancies])

  const scopeLabel = isHQRole(user?.role)
    ? "Published opportunities nationwide"
    : user?.role === "RegionalAdmin"
      ? `Published opportunities in ${user.region || "your region"}`
      : `Published opportunities available to institutions in ${user?.region || "your region"}`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pt-12 md:p-8 md:pt-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-black text-gray-900 md:text-3xl"><BriefcaseBusiness className="h-7 w-7 text-[#FFB800]" /> Learner Vacancies</h2>
          <p className="mt-1 font-medium text-gray-500">{scopeLabel}</p>
        </div>
        <div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input aria-label="Search vacancies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search partner, programme, or location..." className="h-11 rounded-xl pl-10" /></div>
      </div>

      {loading ? (
        <Card className="rounded-2xl"><CardContent className="p-12 text-center text-gray-500">Loading learner vacancies...</CardContent></Card>
      ) : filteredVacancies.length === 0 ? (
        <Card className="rounded-[2rem] border-dashed"><CardContent className="p-14 text-center"><BriefcaseBusiness className="mx-auto h-14 w-14 text-gray-300" /><p className="mt-4 text-lg font-black text-gray-600">No published vacancies found</p><p className="mt-1 text-sm text-gray-500">New opportunities declared by industry partners will appear here.</p></CardContent></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {filteredVacancies.map((vacancy) => {
            const remainingSlots = Math.max(vacancy.slots - vacancy.filledSlots, 0)
            return (
              <Card key={vacancy._id} className="overflow-hidden rounded-[2rem] border-gray-100 shadow-lg">
                <div className="h-2 bg-[#FFB800]" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3"><div><CardTitle className="text-xl font-black">{vacancy.title}</CardTitle><p className="mt-1 font-bold text-indigo-600">{vacancy.partner?.name}</p></div><Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">{remainingSlots} open</Badge></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2"><Badge variant="outline">{vacancy.program}</Badge>{vacancy.tradeArea ? <Badge variant="outline">{vacancy.tradeArea}</Badge> : null}</div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{vacancy.description}</p>
                  {vacancy.requirements ? <div className="rounded-2xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-400">Requirements</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{vacancy.requirements}</p></div> : null}
                  <div className="grid gap-3 text-sm font-medium text-gray-600 sm:grid-cols-2">
                    <span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-indigo-500" /> {remainingSlots} of {vacancy.slots} student slots available</span>
                    <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-500" /> {vacancy.location || vacancy.region}</span>
                    {vacancy.applicationDeadline ? <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-500" /> Apply by {new Date(vacancy.applicationDeadline).toLocaleDateString()}</span> : null}
                    {vacancy.contactEmail ? <a className="inline-flex items-center gap-2 text-blue-600 hover:underline" href={`mailto:${vacancy.contactEmail}`}><Mail className="h-4 w-4" /> {vacancy.contactEmail}</a> : null}
                    {vacancy.contactPhone ? <a className="inline-flex items-center gap-2 text-blue-600 hover:underline" href={`tel:${vacancy.contactPhone}`}><Phone className="h-4 w-4" /> {vacancy.contactPhone}</a> : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
