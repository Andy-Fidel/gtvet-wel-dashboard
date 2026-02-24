import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { ArrowLeft, MapPin, Phone, Mail, Award, Clock, FileText, CheckCircle2, Bookmark, UserCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { LifecycleProgressBar, type LifecycleStage } from "@/components/LifecycleProgressBar"

interface ProfileData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learner: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  placements: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visits: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reports: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessments: any[]
}

export default function LearnerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { authFetch } = useAuth()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authFetch(`http://localhost:5001/api/learners/${id}/profile`)
        if (!res.ok) throw new Error("Failed to fetch profile")
        const profileData = await res.json()
        setData(profileData)
      } catch (err) {
        console.error(err)
        setError("Failed to load learner profile. They may not exist or you do not have permission.")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [id, authFetch])

  if (loading) {
    return (
      <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    )
  }

  if (error || !data?.learner) {
    return (
      <div className="h-full flex-1 flex-col items-center justify-center space-y-4 p-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl font-bold">{error || "Profile not found"}</div>
        <Button onClick={() => navigate('/learners')} variant="outline">Back to Register</Button>
      </div>
    )
  }

  const { learner, placements, visits, reports, assessments } = data

  const getStatusColor = (status: string) => {
    if (status === 'Placed' || status === 'Completed') return "bg-green-500"
    if (status === 'Pending') return "bg-amber-500"
    if (status === 'Dropped') return "bg-red-500"
    return "bg-slate-500"
  }

  // Calculate Lifecycle Stage
  let currentStage: LifecycleStage = 'Pending'
  if (learner.status === 'Placed') {
      currentStage = 'Placed'
      if (visits.length > 0 || reports.length > 0) {
          currentStage = 'Monitored'
      }
  } else if (learner.status === 'Completed') {
      currentStage = 'Completed'
      // If we mark them complete but don't have an assessment, we might still just show completed.
  }

  // If they have an assessment, let's show assessed if not fully completed yet or as a milestone
  if (assessments.length > 0 && learner.status !== 'Completed') {
      currentStage = 'Assessed' 
  }


  return (
    <div className="h-full flex-1 flex-col p-4 md:p-8 space-y-8 overflow-y-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/learners')} className="h-10 w-10 bg-white shadow-sm rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              {learner.name}
              <Badge className={`${getStatusColor(learner.status)} border-0 text-white`}>{learner.status}</Badge>
            </h2>
            <div className="flex items-center gap-4 text-muted-foreground mt-1 text-sm font-medium">
              <span className="flex items-center gap-1"><Bookmark className="h-4 w-4" /> {learner.program} ({learner.year})</span>
              <span className="flex items-center gap-1 font-mono text-[#FFB800] bg-[#FFB800]/10 px-2 rounded-md">{learner.trackingId}</span>
            </div>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
            {currentStage === 'Pending' && (
                <Button onClick={() => navigate(`/placements?learnerId=${learner._id}`)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md">
                    Initiate Placement
                </Button>
            )}
            {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                <>
                    <Button onClick={() => navigate(`/monitoring-visits?learnerId=${learner._id}`)} variant="outline" className="rounded-xl border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100">
                        Log Visit
                    </Button>
                    <Button onClick={() => navigate(`/monthly-reports?learnerId=${learner._id}`)} variant="outline" className="rounded-xl border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-100">
                         Monthly Report
                    </Button>
                    <Button onClick={() => navigate(`/competency-assessments?learnerId=${learner._id}`)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md">
                        Complete Assessment
                    </Button>
                </>
            )}
        </div>
      </div>

      {/* Lifecycle Progress Bar */}
      <div className="bg-white rounded-[2rem] p-6 px-10 shadow-xl border border-gray-100">
         <LifecycleProgressBar currentStage={currentStage} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Bio & placements */}
        <div className="lg:col-span-1 space-y-6">
            {/* Bio Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFB800]/5 rounded-bl-[100px] -z-10" />
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><UserCircle2 className="h-5 w-5 text-gray-400"/> Biodata</h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-xl"><Mail className="h-4 w-4 text-gray-500"/></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Email</p>
                            <p className="text-sm font-medium">{learner.email || 'N/A'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-xl"><Phone className="h-4 w-4 text-gray-500"/></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Phone</p>
                            <p className="text-sm font-medium">{learner.phone || 'N/A'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-xl"><MapPin className="h-4 w-4 text-gray-500"/></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Region</p>
                            <p className="text-sm font-medium">{learner.region}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-xl"><Award className="h-4 w-4 text-gray-500"/></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Index No.</p>
                            <p className="text-sm font-medium font-mono">{learner.indexNumber}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Placements Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><MapPin className="h-5 w-5 text-indigo-400"/> Placements</h3>
                {placements.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No placements recorded.</p>
                ) : (
                    <div className="space-y-4">
                        {placements.map((p, i) => (
                            <div key={i} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                <h4 className="font-bold text-indigo-900">{p.companyName}</h4>
                                <p className="text-xs text-indigo-600/70 mt-1 flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> 
                                    {format(new Date(p.startDate), 'MMM yyyy')} - {format(new Date(p.endDate), 'MMM yyyy')}
                                </p>
                                <p className="text-xs text-gray-600 mt-2">{p.location}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Right Column: Activity (Visits, Reports, Assessments) */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Assessments */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Award className="h-5 w-5 text-emerald-500"/> Competency Assessments</h3>
                {assessments.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No assessments recorded.</p>
                ) : (
                    <div className="space-y-4">
                        {assessments.map((a, i) => (
                            <div key={i} className="flex flex-col md:flex-row gap-4 p-4 border border-gray-50 rounded-2xl bg-emerald-50/30">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="text-emerald-700 bg-emerald-100/50 border-emerald-200">{a.assessmentType}</Badge>
                                        <span className="text-xs text-gray-500 font-medium">{format(new Date(a.assessmentDate), 'PP')}</span>
                                    </div>
                                    <p className="text-sm"><span className="font-semibold text-gray-700">Tech Skills:</span> {a.technicalSkills}</p>
                                    <p className="text-sm mt-1"><span className="font-semibold text-gray-700">Soft Skills:</span> {a.softSkills}</p>
                                    {a.recommendations && <p className="text-sm mt-2 p-2 bg-white rounded-xl text-gray-600 italic">"{a.recommendations}"</p>}
                                </div>
                                <div className="flex flex-row md:flex-col gap-2 justify-center items-center bg-white p-3 rounded-xl shadow-sm border border-emerald-100">
                                    <div className="text-center">
                                        <div className="text-2xl font-black text-emerald-600">{a.overallScore}</div>
                                        <div className="text-[10px] uppercase font-bold text-gray-400">Score</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Monitoring Visits */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-500"/> Monitoring Visits</h3>
                    {visits.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No visits recorded.</p>
                    ) : (
                        <div className="space-y-3">
                            {visits.map((v, i) => (
                                <div key={i} className="p-3 border rounded-xl hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-sm text-gray-900">{v.visitType} Visit</span>
                                        <span className="text-xs text-gray-500">{format(new Date(v.visitDate), 'MMM d, yyyy')}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2 line-clamp-2">{v.feedback}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Monthly Reports */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500"/> Monthly Reports</h3>
                    {reports.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No reports recorded.</p>
                    ) : (
                        <div className="space-y-3">
                            {reports.map((r, i) => (
                                <div key={i} className="p-3 border rounded-xl hover:bg-amber-50 transition-colors bg-white">
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-sm text-gray-900">{r.reportMonth}</span>
                                        <span className="text-xs text-gray-500">{format(new Date(r.submissionDate), 'MMM d, yyyy')}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2 line-clamp-1"><span className="font-medium">Skills:</span> {r.skillsPractised}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>

      </div>
    </div>
  )
}
