import { useEffect, useRef, useState } from "react"
import { Search as SearchIcon, User, Building2, MapPin, Loader2, GraduationCap, Briefcase, ClipboardList, AlertTriangle, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/context/AuthContext"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LearnerResult {
  _id: string
  name: string
  trackingId?: string
  indexNumber?: string
}

interface PlacementResult {
  _id: string
  companyName: string
  address: string
}

interface InstitutionResult {
  _id: string
  name: string
  code: string
}

interface SearchResults {
  learners: LearnerResult[]
  placements: PlacementResult[]
  institutions: InstitutionResult[]
}

interface InstitutionSummaryResponse {
  institution: {
    _id: string
    name: string
    code: string
    region: string
    district: string
    location: string
    category: string
    status: string
    gender: string
    calendarType: string
    programs?: string[]
  }
  summary: {
    totalLearners: number
    currentEnrolled: number
    graduating: number
    graduated: number
    placed: number
    completed: number
    dropped: number
    activePlacements: number
    monitoringVisits: number
    assessments: number
    employerEvaluations: number
    linkedPartners: number
    totalUsers: number
    activeUsers: number
    admins: number
    managers: number
    staff: number
    totalReports: number
    pendingReports: number
  }
  topPrograms: Array<{ program: string; count: number }>
  latestReport: {
    semester: string
    academicYear: string
    status: string
    updatedAt: string
  } | null
  alerts: {
    stalePendingLearners: number
    pendingAttendanceSignOff: number
    activePlacementsWithoutVisits: number
  }
}

export function Search() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>({ learners: [], placements: [], institutions: [] })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedInstitution, setSelectedInstitution] = useState<InstitutionResult | null>(null)
  const [institutionSummary, setInstitutionSummary] = useState<InstitutionSummaryResponse | null>(null)
  const [institutionLoading, setInstitutionLoading] = useState(false)
  const [institutionError, setInstitutionError] = useState("")
  const { authFetch, user } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)
  const searchRequestIdRef = useRef(0)
  const institutionRequestIdRef = useRef(0)
  const isInstitutionPortal = ["Admin", "Manager", "Staff"].includes(user?.role || "")
  const canOpenInstitutionSummary = user?.role === "SuperAdmin"

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++searchRequestIdRef.current

    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true)
        try {
          const response = await authFetch(`/api/search?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error("Search failed")
          }
          const data = await response.json()
          if (searchRequestIdRef.current === requestId) {
            setResults(data)
            setOpen(true)
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("Search error:", error)
          }
        } finally {
          if (searchRequestIdRef.current === requestId) {
            setLoading(false)
          }
        }
      } else {
        setResults({ learners: [], placements: [], institutions: [] })
        setOpen(false)
        setLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, authFetch])

  useEffect(() => {
    if (!selectedInstitution || !canOpenInstitutionSummary) {
      setInstitutionSummary(null)
      setInstitutionError("")
      setInstitutionLoading(false)
      return
    }

    const controller = new AbortController()
    const requestId = ++institutionRequestIdRef.current

    setInstitutionLoading(true)
    setInstitutionSummary(null)
    setInstitutionError("")

    authFetch(`/api/institutions/${selectedInstitution._id}/summary`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.message || "Failed to load institution summary")
        }
        if (institutionRequestIdRef.current === requestId) {
          setInstitutionSummary(payload as InstitutionSummaryResponse)
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (institutionRequestIdRef.current === requestId) {
          setInstitutionError(error instanceof Error ? error.message : "Failed to load institution summary")
        }
      })
      .finally(() => {
        if (institutionRequestIdRef.current === requestId) {
          setInstitutionLoading(false)
        }
      })

    return () => controller.abort()
  }, [selectedInstitution, canOpenInstitutionSummary, authFetch])

  const hasResults = results.learners.length > 0 || results.placements.length > 0 || results.institutions.length > 0

  const resetInstitutionModal = () => {
    institutionRequestIdRef.current += 1
    setSelectedInstitution(null)
    setInstitutionSummary(null)
    setInstitutionError("")
    setInstitutionLoading(false)
  }

  const handleSelect = (type: string, id?: string) => {
    setOpen(false)
    switch (type) {
      case "learner":
        setQuery("")
        if (id) navigate(`/learners/${id}`)
        else navigate("/learners")
        break
      case "placement":
        setQuery("")
        navigate("/placements")
        break
      case "institution":
        if (id && canOpenInstitutionSummary) {
          const institution = results.institutions.find((item) => item._id === id) || null
          setSelectedInstitution(institution)
          return
        }
        setQuery("")
        navigate("/system-overview")
        break
      case "learner-list":
        setQuery("")
        navigate(`/learners?search=${encodeURIComponent(id || "")}`)
        break
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) return

    if (results.learners.length === 1) {
      handleSelect("learner", results.learners[0]._id)
      return
    }

    if (isInstitutionPortal) {
      handleSelect("learner-list", trimmedQuery)
      return
    }

    setOpen(true)
  }

  return (
    <>
      <div className="relative w-full max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg" ref={searchRef}>
        <form onSubmit={handleSubmit} className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={isInstitutionPortal ? "Search learners by name, tracking ID, or index number..." : "Search learners, institutions..."}
            className="pl-11 h-12 bg-gray-50/50 border-gray-200 rounded-2xl focus:bg-white transition-all text-sm text-gray-900"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setOpen(true)}
          />
          {loading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </form>

        {open && hasResults && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-[400px] overflow-y-auto p-2">
              {results.learners.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Learners</div>
                  {results.learners.map((learner) => (
                    <button
                      key={learner._id}
                      onClick={() => handleSelect("learner", learner._id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FFB800]/10 rounded-2xl transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{learner.name}</div>
                        <div className="text-[10px] text-gray-500">{learner.trackingId || learner.indexNumber}</div>
                      </div>
                    </button>
                  ))}
                  {isInstitutionPortal && (
                    <button
                      onClick={() => handleSelect("learner-list", query.trim())}
                      className="w-full mt-1 flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#FFB800]/10 rounded-2xl transition-all group text-left"
                    >
                      <div>
                        <div className="text-sm font-bold text-gray-900">View all learner results</div>
                        <div className="text-[10px] text-gray-500">Open the learner register filtered by this search</div>
                      </div>
                      <span className="text-xs font-black uppercase tracking-wider text-amber-700">Open</span>
                    </button>
                  )}
                </div>
              )}

              {!isInstitutionPortal && results.placements.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Placements</div>
                  {results.placements.map((placement) => (
                    <button
                      key={placement._id}
                      onClick={() => handleSelect("placement")}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FFB800]/10 rounded-2xl transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{placement.companyName}</div>
                        <div className="text-[10px] text-gray-500">{placement.address}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!isInstitutionPortal && results.institutions.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Institutions</div>
                  {results.institutions.map((inst) => (
                    <button
                      key={inst._id}
                      onClick={() => handleSelect("institution", inst._id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FFB800]/10 rounded-2xl transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-all">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{inst.name}</div>
                        <div className="text-[10px] text-gray-500">{inst.code}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {open && !loading && !hasResults && query.length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 text-center z-50">
            <div className="text-sm font-bold text-gray-900">No results found</div>
            <div className="text-xs text-gray-500 mt-1">Try searching for something else</div>
          </div>
        )}
      </div>

      <Dialog open={Boolean(selectedInstitution)} onOpenChange={(nextOpen) => { if (!nextOpen) resetInstitutionModal() }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90vh] bg-white text-gray-900 border-gray-100 p-0 overflow-hidden" overlayClassName="bg-black/50">
          <div className="max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sticky top-0 z-10 space-y-3 border-b border-gray-100 bg-white/95 backdrop-blur px-4 py-4 sm:px-6 md:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="text-gray-900">
                    {institutionSummary?.institution.name || selectedInstitution?.name || "Institution Summary"}
                  </DialogTitle>
                  <DialogDescription className="text-gray-500">
                    HQ snapshot of learner, placement, reporting, and staffing data for this institution.
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Badge className="bg-slate-100 text-slate-700 border-0">
                    {institutionSummary?.institution.code || selectedInstitution?.code || "Institution"}
                  </Badge>
                  {institutionSummary?.institution.status ? (
                    <Badge className={`${institutionSummary.institution.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} border-0`}>
                      {institutionSummary.institution.status}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </DialogHeader>

            {institutionLoading ? (
              <div className="px-4 py-16 sm:px-6 md:px-8 flex flex-col items-center justify-center text-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <p className="mt-4 text-sm font-bold text-gray-600">Loading institution summary...</p>
              </div>
            ) : institutionError ? (
              <div className="px-4 py-12 sm:px-6 md:px-8 text-center">
                <p className="text-sm font-black text-red-600">{institutionError}</p>
              </div>
            ) : institutionSummary ? (
              <div className="px-4 pb-4 pt-6 space-y-6 sm:px-6 sm:pb-6 md:px-8 md:pb-8">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Learners</p>
                    <p className="mt-3 text-3xl font-black text-gray-900">{institutionSummary.summary.totalLearners}</p>
                    <p className="mt-1 text-sm font-medium text-gray-500">{institutionSummary.summary.currentEnrolled} currently enrolled</p>
                  </div>
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Placements</p>
                    <p className="mt-3 text-3xl font-black text-emerald-700">{institutionSummary.summary.activePlacements}</p>
                    <p className="mt-1 text-sm font-medium text-emerald-700/80">{institutionSummary.summary.placed} placed • {institutionSummary.summary.completed} completed</p>
                  </div>
                  <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-600">Reports</p>
                    <p className="mt-3 text-3xl font-black text-blue-700">{institutionSummary.summary.totalReports}</p>
                    <p className="mt-1 text-sm font-medium text-blue-700/80">{institutionSummary.summary.pendingReports} pending action</p>
                  </div>
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600">Users</p>
                    <p className="mt-3 text-3xl font-black text-amber-700">{institutionSummary.summary.totalUsers}</p>
                    <p className="mt-1 text-sm font-medium text-amber-700/80">{institutionSummary.summary.activeUsers} active accounts</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <h4 className="text-lg font-black text-gray-900">Institution Details</h4>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                      <div><span className="font-black text-gray-500">Region:</span> <span className="text-gray-900">{institutionSummary.institution.region}</span></div>
                      <div><span className="font-black text-gray-500">District:</span> <span className="text-gray-900">{institutionSummary.institution.district}</span></div>
                      <div><span className="font-black text-gray-500">Location:</span> <span className="text-gray-900">{institutionSummary.institution.location}</span></div>
                      <div><span className="font-black text-gray-500">Calendar:</span> <span className="text-gray-900">{institutionSummary.institution.calendarType}</span></div>
                      <div><span className="font-black text-gray-500">Category:</span> <span className="text-gray-900">{institutionSummary.institution.category}</span></div>
                      <div><span className="font-black text-gray-500">Gender:</span> <span className="text-gray-900">{institutionSummary.institution.gender}</span></div>
                    </div>
                    {institutionSummary.institution.programs?.length ? (
                      <div className="mt-4">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Registered Programs</p>
                        <div className="flex flex-wrap gap-2">
                          {institutionSummary.institution.programs.slice(0, 8).map((program) => (
                            <Badge key={program} className="bg-gray-100 text-gray-700 border-0">{program}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <h4 className="text-lg font-black text-gray-900">Operational Snapshot</h4>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-slate-700"><GraduationCap className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Academic</span></div>
                        <p className="mt-3 text-sm font-medium text-slate-700">{institutionSummary.summary.graduating} graduating • {institutionSummary.summary.graduated} graduated • {institutionSummary.summary.dropped} dropped</p>
                      </div>
                      <div className="rounded-2xl bg-sky-50 p-4">
                        <div className="flex items-center gap-2 text-sky-700"><ClipboardList className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Quality</span></div>
                        <p className="mt-3 text-sm font-medium text-sky-700">{institutionSummary.summary.monitoringVisits} visits • {institutionSummary.summary.assessments} assessments • {institutionSummary.summary.employerEvaluations} evaluations</p>
                      </div>
                      <div className="rounded-2xl bg-violet-50 p-4">
                        <div className="flex items-center gap-2 text-violet-700"><Briefcase className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Partners</span></div>
                        <p className="mt-3 text-sm font-medium text-violet-700">{institutionSummary.summary.linkedPartners} active linked partners</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-4">
                        <div className="flex items-center gap-2 text-amber-700"><Users className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Team</span></div>
                        <p className="mt-3 text-sm font-medium text-amber-700">{institutionSummary.summary.admins} admins • {institutionSummary.summary.managers} managers • {institutionSummary.summary.staff} staff</p>
                      </div>
                    </div>
                    {institutionSummary.latestReport ? (
                      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Latest Report</p>
                        <p className="mt-2 text-sm font-black text-gray-900">{institutionSummary.latestReport.semester} {institutionSummary.latestReport.academicYear}</p>
                        <p className="mt-1 text-sm text-gray-600">{institutionSummary.latestReport.status}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <h4 className="text-lg font-black text-gray-900">Top Programs</h4>
                    <div className="mt-4 space-y-3">
                      {institutionSummary.topPrograms.length > 0 ? institutionSummary.topPrograms.map((program) => (
                        <div key={program.program} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                          <span className="text-sm font-bold text-gray-800">{program.program}</span>
                          <Badge className="bg-white text-gray-700 border border-gray-200">{program.count}</Badge>
                        </div>
                      )) : (
                        <p className="text-sm text-gray-500">No program breakdown available.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <h4 className="text-lg font-black text-gray-900">Alerts</h4>
                    <div className="mt-4 space-y-3">
                      {[
                        { label: "Pending learners older than 14 days", value: institutionSummary.alerts.stalePendingLearners },
                        { label: "Attendance logs pending sign-off for 3+ days", value: institutionSummary.alerts.pendingAttendanceSignOff },
                        { label: "Active placements without visits", value: institutionSummary.alerts.activePlacementsWithoutVisits },
                      ].map((alert) => (
                        <div key={alert.label} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-2xl flex items-center justify-center ${alert.value > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-gray-800">{alert.label}</span>
                          </div>
                          <span className={`text-lg font-black ${alert.value > 0 ? "text-red-600" : "text-emerald-600"}`}>{alert.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
