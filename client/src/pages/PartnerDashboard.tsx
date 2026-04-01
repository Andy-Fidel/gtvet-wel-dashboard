import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Building2, Briefcase, Star, ClipboardList, LayoutList, LayoutGrid, Search, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmployerEvaluationForm } from "./EmployerEvaluationForm"
import { Badge } from "@/components/ui/badge"

interface PartnerPlacement {
  _id: string;
  learner?: {
    _id: string;
    name: string;
    trackingId: string;
    program: string;
  };
  institution: string;
  startDate: string;
  endDate: string;
}

export default function PartnerDashboard() {
  const navigate = useNavigate()
  const [placements, setPlacements] = useState<PartnerPlacement[]>([])
  const [loading, setLoading] = useState(true)
  const [evaluateOpen, setEvaluateOpen] = useState(false)
  const [selectedLearner, setSelectedLearner] = useState<{ _id: string; name?: string; trackingId?: string; program?: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewMode, setViewMode] = useState<'list' | 'tile'>('tile')
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const itemsPerPage = 6
  const { authFetch, user } = useAuth()

  const filteredPlacements = placements.filter((placement) => {
    const query = searchQuery.toLowerCase()
    const name = placement.learner?.name?.toLowerCase() || ""
    const trackingId = placement.learner?.trackingId?.toLowerCase() || ""
    const program = placement.learner?.program?.toLowerCase() || ""
    const institution = placement.institution?.toLowerCase() || ""
    return name.includes(query) || trackingId.includes(query) || program.includes(query) || institution.includes(query)
  })

  const totalPages = Math.ceil(filteredPlacements.length / itemsPerPage)
  const paginatedPlacements = filteredPlacements.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const shortenInstitutionName = (name: string) => {
    if (name.length <= 25) return name
    const words = name.split(' ')
    if (words.length >= 2) {
      return words.slice(0, 2).join(' ') + '...'
    }
    return name.slice(0, 25) + '...'
  }

  useEffect(() => {
    const fetchPlacements = async () => {
      try {
        const res = await authFetch('/api/partner-portal/placements')
        const data = await res.json()
        setPlacements(data)
      } catch (err) {
        console.error("Error fetching partner placements:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlacements()
  }, [refreshKey, authFetch])

  const handleEvaluateClick = (learner: { _id: string; name?: string; trackingId?: string; program?: string }) => {
      setSelectedLearner(learner)
      setEvaluateOpen(true)
  }

  const handleEvaluationSuccess = () => {
      setEvaluateOpen(false)
      setSelectedLearner(null)
      setRefreshKey(prev => prev + 1)
  }

  const clearSearch = () => {
    setSearchQuery("")
    setCurrentPage(1)
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Building2 className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Industry Partner Portal
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">Welcome, {user?.name}. View your assigned learners here.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search learners..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
              className="pl-10 pr-10 py-2 h-10 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FFB800]/20 focus:border-[#FFB800] w-64"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setViewMode('tile')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                viewMode === 'tile'
                  ? 'bg-[#FFB800] text-white font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Tile view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-[#FFB800] text-white font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={evaluateOpen} onOpenChange={setEvaluateOpen}>
        <DialogContent className="sm:max-w-[700px] bg-white rounded-[2rem] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
            <DialogHeader className="p-6 pb-0">
                <DialogTitle className="text-2xl font-black flex items-center gap-2">
                    <Star className="h-6 w-6 text-[#FFB800]" /> Evaluate {selectedLearner?.name}
                </DialogTitle>
                <DialogDescription className="font-medium text-gray-500">
                    Provide your professional feedback on the learner's performance.
                </DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-2">
                {selectedLearner && (
                    <EmployerEvaluationForm onSuccess={handleEvaluationSuccess} learnerId={selectedLearner._id} />
                )}
            </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="w-full text-center p-12 text-gray-400 font-bold animate-pulse">Loading assigned learners...</div>
      ) : placements.length === 0 ? (
        <div className="w-full text-center p-16 bg-white/50 border border-dashed border-gray-300 rounded-[2.5rem]">
          <Briefcase className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black text-gray-500 tracking-tight">No Active Placements</h3>
          <p className="text-gray-400 mt-2 font-medium">You currently do not have any learners assigned to your organization.</p>
        </div>
      ) : viewMode === 'tile' ? (
        <>
          <div className="max-h-[600px] overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedPlacements.map((placement) => (
                <Card key={placement._id} className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-[2rem] overflow-hidden group">
                  <div className="h-2 w-full bg-[#FFB800]" />
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl font-black text-gray-900 leading-tight">{placement.learner?.name}</CardTitle>
                        <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-wide flex items-center gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5 text-gray-400" />
                            {placement.learner?.trackingId || 'N/A'}
                        </p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0">{placement.learner?.program}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 mb-6">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-500 uppercase">Institution</span>
                          <span className="text-sm font-bold text-gray-900 truncate max-w-[150px]" title={placement.institution}>{shortenInstitutionName(placement.institution)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-medium text-gray-600 px-1">
                          <span>Started: {new Date(placement.startDate).toLocaleDateString()}</span>
                          <span>Ends: {new Date(placement.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <Button
                        onClick={() => placement.learner && handleEvaluateClick(placement.learner)}
                        className="w-full bg-white border-2 border-[#FFB800] text-[#FFB800] hover:bg-[#FFB800] hover:text-white font-black rounded-xl h-11 transition-colors"
                        disabled={!placement.learner}
                    >
                        <Star className="mr-2 h-4 w-4" /> Evaluate Learner
                    </Button>
                    <Button
                        onClick={() => placement.learner && navigate(`/attendance-logs?learnerId=${placement.learner._id}`)}
                        variant="outline"
                        className="w-full mt-3 border-gray-200 text-gray-700 hover:bg-gray-50 font-bold rounded-xl h-11"
                        disabled={!placement.learner}
                    >
                        <ClipboardList className="mr-2 h-4 w-4" /> Review Hours
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-10 h-10 p-0 bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ‹
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 p-0 font-bold rounded-xl transition-all ${
                    currentPage === page
                      ? 'bg-[#FFB800] text-white border-2 border-[#FFB800]'
                      : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800]'
                  }`}
                >
                  {page}
                </Button>
              ))}
              <Button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-10 h-10 p-0 bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ›
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 font-bold text-xs text-gray-500 uppercase tracking-wide">
              <div className="col-span-3">Learner</div>
              <div className="col-span-2">Tracking ID</div>
              <div className="col-span-2">Program</div>
              <div className="col-span-2">Institution</div>
              <div className="col-span-2">Duration</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
            <div className="divide-y divide-gray-100">
              {paginatedPlacements.map((placement) => (
                <div key={placement._id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors">
                  <div className="col-span-3">
                    <p className="font-black text-gray-900">{placement.learner?.name}</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-bold text-gray-700 text-sm">{placement.learner?.trackingId || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0 font-bold text-xs">{placement.learner?.program}</Badge>
                  </div>
                  <div className="col-span-2">
                    <span className="font-bold text-gray-700 text-sm truncate" title={placement.institution}>{shortenInstitutionName(placement.institution)}</span>
                  </div>
                  <div className="col-span-2">
                    <div className="flex flex-col text-xs font-medium text-gray-600">
                      <span>Start: {new Date(placement.startDate).toLocaleDateString()}</span>
                      <span>End: {new Date(placement.endDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="col-span-1 text-right">
                    <Button
                      onClick={() => placement.learner && handleEvaluateClick(placement.learner)}
                      className="bg-white border-2 border-[#FFB800] text-[#FFB800] hover:bg-[#FFB800] hover:text-white font-black rounded-xl h-9 px-3 transition-colors"
                      disabled={!placement.learner}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-10 h-10 p-0 bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ‹
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 p-0 font-bold rounded-xl transition-all ${
                    currentPage === page
                      ? 'bg-[#FFB800] text-white border-2 border-[#FFB800]'
                      : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800]'
                  }`}
                >
                  {page}
                </Button>
              ))}
              <Button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-10 h-10 p-0 bg-white border-2 border-gray-200 text-gray-700 hover:border-[#FFB800] hover:text-[#FFB800] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ›
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
