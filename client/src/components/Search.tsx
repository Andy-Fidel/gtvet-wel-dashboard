
import { useState, useEffect, useRef } from "react"
import { Search as SearchIcon, User, Building2, MapPin, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
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

export function Search() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>({ learners: [], placements: [], institutions: [] })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const { authFetch } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)

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
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true)
        try {
          const response = await authFetch(`http://localhost:5001/api/search?q=${encodeURIComponent(query)}`)
          if (response.ok) {
            const data = await response.json()
            setResults(data)
            setOpen(true)
          }
        } catch (error) {
          console.error("Search error:", error)
        } finally {
          setLoading(false)
        }
      } else {
        setResults({ learners: [], placements: [], institutions: [] })
        setOpen(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, authFetch])

  const hasResults = results.learners.length > 0 || results.placements.length > 0 || results.institutions.length > 0

  const handleSelect = (type: string) => {
    setOpen(false)
    setQuery("")
    switch (type) {
      case 'learner':
        navigate('/learners')
        break
      case 'placement':
        navigate('/placements')
        break
      case 'institution':
        navigate('/system-overview')
        break
    }
  }

  return (
    <div className="relative w-96" ref={searchRef}>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search learners, institutions..."
          className="pl-11 h-12 bg-gray-50/50 border-gray-200 rounded-2xl focus:bg-white transition-all text-sm text-gray-900"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>

      {open && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[400px] overflow-y-auto p-2">
            
            {results.learners.length > 0 && (
              <div className="mb-2">
                <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Learners</div>
                {results.learners.map((learner) => (
                  <button
                    key={learner._id}
                    onClick={() => handleSelect('learner')}
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
              </div>
            )}

            {results.placements.length > 0 && (
              <div className="mb-2">
                <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Placements</div>
                {results.placements.map((placement) => (
                  <button
                    key={placement._id}
                    onClick={() => handleSelect('placement')}
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

            {results.institutions.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Institutions</div>
                {results.institutions.map((inst) => (
                  <button
                    key={inst._id}
                    onClick={() => handleSelect('institution')}
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
  )
}
