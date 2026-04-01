import { useState, useEffect, useCallback, useRef } from "react"
import { DocumentUpload } from "@/components/DocumentUpload"
import { DocumentList } from "@/components/DocumentList"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { ArrowLeft, MapPin, Phone, Mail, Award, Clock, FileText, CheckCircle2, Bookmark, UserCircle2, Plus, Briefcase, Star, User, Paperclip, Camera, Loader2, Edit2, Activity, ClipboardCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { LifecycleProgressBar, type LifecycleStage } from "@/components/LifecycleProgressBar"
import { ProgressTimeline } from "@/components/ProgressTimeline"
import { ProgressScoreCard } from "@/components/ProgressScoreCard"
import { PlacementDurationTracker } from "@/components/PlacementDurationTracker"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UnifiedPlacementForm } from "./UnifiedPlacementForm"
import { MonitoringVisitForm } from "./MonitoringVisitForm"
import { CompetencyAssessmentForm } from "./CompetencyAssessmentForm"
import { LearnerForm } from "./learners/LearnerForm"

interface ProfileData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learner: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  placements: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visits: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  semesterReports: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluations: any[];
}

interface ProgressData {
  overall: number;
  completedMilestones: { key: string; label: string; completedAt?: string; details?: Record<string, unknown> }[];
  pendingMilestones: { key: string; label: string }[];
  categoryBreakdown: { placement: number; assessment: number; monitoring: number; documentation: number };
  atRisk: boolean;
  atRiskReasons: string[];
  placementProgress: { startDate: string; endDate?: string; elapsedDays: number; totalDays: number; remainingDays: number; percent: number } | null;
}

export default function LearnerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { authFetch, token } = useAuth()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [placementOpen, setPlacementOpen] = useState(false)
  const [visitOpen, setVisitOpen] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [documents, setDocuments] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [profilePicUploading, setProfilePicUploading] = useState(false)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setProfilePicUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/documents/profile-picture/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      setRefreshKey(prev => prev + 1)
    } catch {
      console.error('Profile pic upload failed')
    } finally {
      setProfilePicUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const fetchProfile = useCallback(async () => {
    try {
      const res = await authFetch(`/api/learners/${id}/profile`)
      if (!res.ok) throw new Error("Failed to fetch profile")
      const profileData = await res.json()
      setData(profileData)
    } catch (err) {
      console.error(err)
      setError("Failed to load learner profile. They may not exist or you do not have permission.")
    } finally {
      setLoading(false)
    }
  }, [id, authFetch])

  const fetchDocuments = useCallback(async () => {
    if (!id) return
    try {
      const res = await authFetch(`/api/documents?learnerId=${id}`)
      if (res.ok) {
        const docs = await res.json()
        setDocuments(docs)
      }
    } catch (err) {
      console.error('Error fetching documents:', err)
    } finally {
      setDocsLoading(false)
    }
  }, [id, authFetch])

  const fetchProgress = useCallback(async () => {
    if (!id) return
    try {
      const res = await authFetch(`/api/learners/${id}/progress`)
      if (res.ok) {
        const data = await res.json()
        setProgress(data.progress)
      }
    } catch (err) {
      console.error('Error fetching progress:', err)
    } finally {
      setProgressLoading(false)
    }
  }, [id, authFetch])

  useEffect(() => {
    fetchProfile()
    fetchDocuments()
    fetchProgress()
  }, [fetchProfile, fetchDocuments, fetchProgress, refreshKey])

  const handleFormSuccess = () => {
    setRefreshKey(prev => prev + 1)
  }

  if (loading) {
    return (
      <div className="h-full flex-1 flex-col space-y-4 md:space-y-8 pt-16 px-0 pb-4 sm:p-4 md:p-8 flex">
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

  const { learner, placements, visits, semesterReports, assessments, evaluations } = data

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
      if (visits.length > 0 || semesterReports.length > 0) {
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/learners')} className="h-10 w-10 bg-white shadow-sm rounded-full shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Profile Avatar */}
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={profilePicUploading}
            className="relative h-16 w-16 md:h-20 md:w-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white shrink-0 group cursor-pointer"
          >
            <input
              ref={avatarInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleProfilePicUpload}
            />
            {learner.profilePicture ? (
              <img src={learner.profilePicture} alt={learner.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#FFB800] to-amber-600 flex items-center justify-center">
                <span className="text-white font-black text-xl md:text-2xl">
                  {learner.firstName?.[0]}{learner.lastName?.[0]}
                </span>
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {profilePicUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Camera className="h-6 w-6 text-white" />
              )}
            </div>
          </button>

          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
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
            <Button onClick={() => setEditOpen(true)} variant="outline" className="rounded-xl border-gray-200 text-gray-700 bg-white hover:bg-gray-50">
                <Edit2 className="mr-2 h-4 w-4" /> Edit Profile
            </Button>
            {currentStage === 'Pending' && (
                <Button onClick={() => setPlacementOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md">
                    <Plus className="mr-2 h-4 w-4" /> Initiate Placement
                </Button>
            )}
            {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                <>
                    <Button onClick={() => navigate(`/attendance-logs?learnerId=${learner._id}`)} variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100">
                        <ClipboardCheck className="mr-2 h-4 w-4" /> Log Hours
                    </Button>
                    <Button onClick={() => setVisitOpen(true)} variant="outline" className="rounded-xl border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100">
                        <Plus className="mr-2 h-4 w-4" /> Log Visit
                    </Button>
                    <Button onClick={() => navigate(`/semester-reports`)} variant="outline" className="rounded-xl border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-100">
                         Semester Reports
                    </Button>
                    <Button onClick={() => setAssessmentOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md">
                        <Plus className="mr-2 h-4 w-4" /> Complete Assessment
                    </Button>
                </>
            )}
            {currentStage === 'Completed' && (
                <Button onClick={() => navigate(`/attendance-logs?learnerId=${learner._id}`)} variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100">
                    <ClipboardCheck className="mr-2 h-4 w-4" /> View Hours
                </Button>
            )}
        </div>
      </div>

      {/* Lifecycle Progress Bar */}
      <div className="bg-white rounded-[2rem] p-6 px-10 shadow-xl border border-gray-100">
         <LifecycleProgressBar currentStage={currentStage} />
      </div>

      {/* Progress Section with Tabs */}
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-5 w-5 text-emerald-500" />
          <h3 className="font-bold text-lg text-gray-900">Learner Progress Tracker</h3>
        </div>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-3 bg-gray-100 rounded-xl p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm rounded-lg text-sm font-bold">Overview</TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm rounded-lg text-sm font-bold">Timeline</TabsTrigger>
            <TabsTrigger value="placement" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm rounded-lg text-sm font-bold">Placement</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            {progressLoading ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : progress ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ProgressScoreCard
                  overall={progress.overall}
                  categoryBreakdown={progress.categoryBreakdown}
                  atRisk={progress.atRisk}
                  atRiskReasons={progress.atRiskReasons}
                />
                <div className="bg-gray-50 rounded-2xl p-6 flex flex-col justify-center">
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-4">Quick Stats</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Completed Milestones</span>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-bold">
                        {progress.completedMilestones.length} / {progress.completedMilestones.length + progress.pendingMilestones.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Pending Milestones</span>
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-bold">
                        {progress.pendingMilestones.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Assessments Done</span>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-bold">
                        {assessments.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Monitoring Visits</span>
                      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 font-bold">
                        {visits.length}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Unable to load progress data</p>
            )}
          </TabsContent>
          <TabsContent value="timeline" className="mt-6">
            {progressLoading ? (
              <Skeleton className="h-96 w-full rounded-2xl" />
            ) : progress ? (
              <ProgressTimeline
                completedMilestones={progress.completedMilestones}
                pendingMilestones={progress.pendingMilestones}
              />
            ) : (
              <p className="text-center text-gray-500 py-8">Unable to load timeline</p>
            )}
          </TabsContent>
          <TabsContent value="placement" className="mt-6">
            {progressLoading ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : (
              <PlacementDurationTracker
                placementProgress={progress?.placementProgress}
                companyName={placements[0]?.companyName}
              />
            )}
          </TabsContent>
        </Tabs>
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
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Guardian Contact</p>
                            <p className="text-sm font-medium">{learner.guardianContact || 'N/A'}</p>
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
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-xl"><User className="h-4 w-4 text-gray-500"/></div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Gender</p>
                            <p className="text-sm font-medium">{learner.gender || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Placements Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-indigo-400"/> Placements</h3>
                    {currentStage === 'Pending' && (
                        <Button size="sm" onClick={() => setPlacementOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-xl h-8 px-3">
                            <Plus className="mr-1 h-3 w-3" /> Add
                        </Button>
                    )}
                </div>
                {placements.length === 0 ? (
                    <div className="text-center py-6">
                        <MapPin className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400 font-medium">No placements yet</p>
                        {currentStage === 'Pending' && (
                            <Button variant="ghost" size="sm" onClick={() => setPlacementOpen(true)} className="mt-2 text-indigo-600 hover:text-indigo-700 text-xs font-bold">
                                Initiate first placement →
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {placements.map((p, i) => (
                            <div key={i} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                <h4 className="font-bold text-indigo-900">{p.companyName}</h4>
                                <p className="text-xs text-indigo-600/70 mt-1 flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> 
                                    {p.startDate ? format(new Date(p.startDate), 'MMM yyyy') : 'TBD'} - {p.endDate ? format(new Date(p.endDate), 'MMM yyyy') : 'TBD'}
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Award className="h-5 w-5 text-emerald-500"/> Competency Assessments</h3>
                    {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                        <Button size="sm" onClick={() => setAssessmentOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl h-8 px-3">
                            <Plus className="mr-1 h-3 w-3" /> Add
                        </Button>
                    )}
                </div>
                {assessments.length === 0 ? (
                    <div className="text-center py-6">
                        <Award className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400 font-medium">No assessments yet</p>
                        {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                            <Button variant="ghost" size="sm" onClick={() => setAssessmentOpen(true)} className="mt-2 text-emerald-600 hover:text-emerald-700 text-xs font-bold">
                                Record first assessment →
                            </Button>
                        )}
                    </div>
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

            {/* Employer Evaluations */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100 mt-6 lg:mt-0 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Briefcase className="h-5 w-5 text-purple-500"/> Employer Evaluations</h3>
                </div>
                {evaluations?.length === 0 ? (
                    <div className="text-center py-6">
                        <Briefcase className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400 font-medium">No employer feedback yet</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {evaluations?.map((e, i) => (
                            <div key={i} className="flex flex-col md:flex-row gap-4 p-4 border border-gray-50 rounded-2xl bg-purple-50/30">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="text-purple-700 bg-purple-100/50 border-purple-200">{e.partner?.name}</Badge>
                                        <span className="text-xs text-gray-500 font-medium">{format(new Date(e.evaluationDate), 'PP')}</span>
                                    </div>
                                    <p className="text-sm"><span className="font-semibold text-gray-700">Evaluator:</span> {e.evaluatorName} ({e.evaluatorPosition})</p>
                                    <div className="text-sm mt-2 flex flex-wrap gap-2">
                                        <Badge variant="secondary" className="bg-white text-xs text-gray-600 font-medium border-gray-200 shadow-sm">Punctuality: <span className="text-[#FFB800] ml-1">{e.metrics?.punctualityAndAttendance}★</span></Badge>
                                        <Badge variant="secondary" className="bg-white text-xs text-gray-600 font-medium border-gray-200 shadow-sm">Technical: <span className="text-[#FFB800] ml-1">{e.metrics?.technicalSkills}★</span></Badge>
                                        <Badge variant="secondary" className="bg-white text-xs text-gray-600 font-medium border-gray-200 shadow-sm">Teamwork: <span className="text-[#FFB800] ml-1">{e.metrics?.teamworkAndCommunication}★</span></Badge>
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {e.strengths && (
                                            <div className="p-2 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                                <p className="text-xs font-bold text-emerald-700 mb-1">Strengths</p>
                                                <p className="text-xs text-gray-600 italic">"{e.strengths}"</p>
                                            </div>
                                        )}
                                        {e.areasForImprovement && (
                                            <div className="p-2 bg-amber-50/50 border border-amber-100 rounded-xl">
                                                <p className="text-xs font-bold text-amber-700 mb-1">Needs Improvement</p>
                                                <p className="text-xs text-gray-600 italic">"{e.areasForImprovement}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-row md:flex-col gap-2 justify-center items-center bg-white p-3 rounded-xl shadow-sm border border-purple-100">
                                    <div className="text-center">
                                        <div className="text-2xl font-black text-purple-600">{e.overallScore}</div>
                                        <div className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-0.5 justify-center"><Star className="h-2.5 w-2.5 text-purple-400 fill-current"/> Score</div>
                                    </div>
                                    <div className={`mt-2 text-[10px] font-bold uppercase px-2 py-1 rounded-full ${e.wouldHire ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {e.wouldHire ? 'Would Hire' : 'No Hire'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 lg:mt-0">
                 {/* Monitoring Visits */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-500"/> Monitoring Visits</h3>
                        {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                            <Button size="sm" onClick={() => setVisitOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl h-8 px-3">
                                <Plus className="mr-1 h-3 w-3" /> Add
                            </Button>
                        )}
                    </div>
                    {visits.length === 0 ? (
                        <div className="text-center py-6">
                            <CheckCircle2 className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                            <p className="text-sm text-gray-400 font-medium">No visits yet</p>
                            {(currentStage === 'Placed' || currentStage === 'Monitored') && (
                                <Button variant="ghost" size="sm" onClick={() => setVisitOpen(true)} className="mt-2 text-blue-600 hover:text-blue-700 text-xs font-bold">
                                    Log first visit →
                                </Button>
                            )}
                        </div>
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

                {/* Semester Reports */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500"/> Semester Reports</h3>
                    {semesterReports.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No semester reports generated yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {semesterReports.map((r: { _id: string, semester: string, academicYear: string, status: string, summary?: { totalLearners: number, placed: number } }, i: number) => (
                                <div key={i} className="p-3 border rounded-xl hover:bg-amber-50 transition-colors bg-white cursor-pointer" onClick={() => navigate(`/semester-reports/${r._id}`)}>
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-sm text-gray-900">{r.semester} — {r.academicYear}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                            r.status === 'HQ_Approved' ? 'bg-green-100 text-green-700' :
                                            r.status === 'Regional_Approved' ? 'bg-amber-100 text-amber-700' :
                                            r.status === 'Submitted' ? 'bg-blue-100 text-blue-700' :
                                            r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>{r.status?.replace('_', ' ')}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">{r.summary?.totalLearners || 0} learners • {r.summary?.placed || 0} placed</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Documents Section - Horizontal Card Layout */}
        <div className="bg-white rounded-[2rem] p-3 md:p-6 shadow-xl border border-gray-100 mt-6 lg:mt-0 lg:col-span-2">
            <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-8 border border-gray-50 rounded-[2.5rem] bg-violet-50/30">
                <div className="flex-1">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Paperclip className="h-5 w-5 text-violet-500"/> Documents
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{documents.length}</span>
                    </h3>
                    <DocumentList documents={documents} onDelete={fetchDocuments} loading={docsLoading} />
                </div>
                
                <div className="lg:w-80 shrink-0">
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-violet-100 h-full flex flex-col">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Upload Document</p>
                        <DocumentUpload learnerId={id} onUploadSuccess={fetchDocuments} />
                    </div>
                </div>
            </div>
        </div>

      </div>

      {/* Inline Dialogs */}
      <Dialog open={placementOpen} onOpenChange={setPlacementOpen}>
        <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Add Placement for {learner.name}</DialogTitle>
            <DialogDescription>Enter placement details for this learner.</DialogDescription>
          </DialogHeader>
          <UnifiedPlacementForm onSuccess={() => { setPlacementOpen(false); handleFormSuccess(); }} initialData={{ learner: learner._id }} />
        </DialogContent>
      </Dialog>

      <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
        <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Log Visit for {learner.name}</DialogTitle>
            <DialogDescription>Record a monitoring visit for this learner.</DialogDescription>
          </DialogHeader>
          <MonitoringVisitForm onSuccess={() => { setVisitOpen(false); handleFormSuccess(); }} initialData={{ learner: learner._id }} />
        </DialogContent>
      </Dialog>

      <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}>
        <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">Assessment for {learner.name}</DialogTitle>
              <DialogDescription className="font-bold text-gray-400">Record a competency evaluation for this learner.</DialogDescription>
            </DialogHeader>
            <div className="bg-gray-900 p-8 rounded-[2rem] shadow-inner">
              <CompetencyAssessmentForm onSuccess={() => { setAssessmentOpen(false); handleFormSuccess(); }} initialData={{ learner: learner._id }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh] rounded-[2rem] border-0 shadow-2xl p-0">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">Edit {learner.name}</DialogTitle>
              <DialogDescription className="font-bold text-gray-400">Update learner information.</DialogDescription>
            </DialogHeader>
            <div className="bg-gray-900 p-8 rounded-[2rem] shadow-inner">
              <LearnerForm
                onSuccess={() => { setEditOpen(false); handleFormSuccess(); }}
                initialData={{
                  _id: learner._id,
                  lastName: learner.lastName || '',
                  firstName: learner.firstName || '',
                  middleName: learner.middleName || '',
                  gender: learner.gender || 'Male',
                  phone: learner.phone || '',
                  guardianContact: learner.guardianContact || '',
                  indexNumber: learner.indexNumber || '',
                  program: learner.program || '',
                  year: learner.year || '',
                  status: learner.status || 'Pending',
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
