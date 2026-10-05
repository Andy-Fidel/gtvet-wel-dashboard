import { CohortComparison } from './CohortComparison'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, XAxis, YAxis, Tooltip, Line, LineChart } from 'recharts'
import { Users, Briefcase, Clock, ArrowUpRight, TrendingUp, GraduationCap, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AdminOverviewStats } from '@/types/dashboard'

export type LearnerOversightData = Pick<AdminOverviewStats, 'academicSummary' | 'intakeCohorts' | 'regionalCohortBreakdown' | 'institutionCohortBreakdown' | 'learnerProgressSummary' | 'learnerQualitySummary'>

interface LearnerOversightProps {
  adminData: LearnerOversightData
  adminScopeLabel: string
  openLearnerRegister: (params?: Record<string, string>) => void
  openInterventionQueue: (params?: Record<string, string>) => void
}

export function LearnerOversight({ adminData, adminScopeLabel, openLearnerRegister, openInterventionQueue }: LearnerOversightProps) {
  const navigate = useNavigate()
  return <section aria-label="Learner oversight" className="space-y-6">
      {adminData.academicSummary && (
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
            <CardTitle className="text-2xl font-black">Academic Lifecycle</CardTitle>
            <CardDescription className="text-sm font-bold text-gray-400 mt-1">
              Separate current enrolled learners from graduating and graduated cohorts.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button type="button" onClick={() => openLearnerRegister({ academicStatus: "CurrentEnrolled" })} className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5 text-left transition hover:bg-indigo-100/70">
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <Users className="h-5 w-5 text-indigo-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Enrolled</span>
                </div>
                <div className="mt-5 text-3xl font-black text-indigo-700">{adminData.academicSummary.currentEnrolled}</div>
                <p className="mt-1 text-sm font-bold text-indigo-800/70">Current active + graduating learners</p>
              </button>
              <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduating" })} className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5 text-left transition hover:bg-amber-100/70">
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <ArrowUpRight className="h-5 w-5 text-amber-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-amber-700">Final Year</span>
                </div>
                <div className="mt-5 text-3xl font-black text-amber-700">{adminData.academicSummary.graduating}</div>
                <p className="mt-1 text-sm font-bold text-amber-800/70">Graduating learners</p>
              </button>
              <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Graduated" })} className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5 text-left transition hover:bg-emerald-100/70">
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <GraduationCap className="h-5 w-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Alumni</span>
                </div>
                <div className="mt-5 text-3xl font-black text-emerald-700">{adminData.academicSummary.graduated}</div>
                <p className="mt-1 text-sm font-bold text-emerald-800/70">Graduated learners</p>
              </button>
              <button type="button" onClick={() => openLearnerRegister({ academicStatus: "Dropped" })} className="rounded-[1.5rem] border border-rose-100 bg-rose-50/70 p-5 text-left transition hover:bg-rose-100/70">
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <Clock className="h-5 w-5 text-rose-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-rose-700">Dropped</span>
                </div>
                <div className="mt-5 text-3xl font-black text-rose-700">{adminData.academicSummary.dropped}</div>
                <p className="mt-1 text-sm font-bold text-rose-800/70">Dropped from academic cycle</p>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <CohortComparison cohorts={adminData.intakeCohorts || []} scopeLabel={adminScopeLabel} />

      {adminData.learnerProgressSummary && (
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-black">Learner Risk & Progress</CardTitle>
                <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                  HQ intervention summary based on learner progress, placement execution, monitoring, and outcomes.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                className="rounded-xl border-gray-200 font-bold"
                onClick={() => openInterventionQueue({ risk: 'at-risk' })}
              >
                Open Intervention Queue
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => openInterventionQueue({ risk: 'at-risk' })}
                className="rounded-[1.5rem] border border-red-100 bg-red-50/70 p-5 text-left transition hover:bg-red-100/70"
              >
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-red-700">At Risk</span>
                </div>
                <div className="mt-5 text-3xl font-black text-red-700">{adminData.learnerProgressSummary.atRiskCount}</div>
                <p className="mt-1 text-sm font-bold text-red-800/70">Learners needing intervention</p>
              </button>

              <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Progress</span>
                </div>
                <div className="mt-5 text-3xl font-black text-emerald-700">{adminData.learnerProgressSummary.averageProgress}%</div>
                <p className="mt-1 text-sm font-bold text-emerald-800/70">Average learner progress</p>
              </div>

              <button
                type="button"
                onClick={() => openLearnerRegister({ status: 'Completed' })}
                className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5 text-left transition hover:bg-indigo-100/70"
              >
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Completed</span>
                </div>
                <div className="mt-5 text-3xl font-black text-indigo-700">{adminData.learnerProgressSummary.completedCount}</div>
                <p className="mt-1 text-sm font-bold text-indigo-800/70">Learners who completed WEL</p>
              </button>

              <button
                type="button"
                onClick={() => openLearnerRegister({ status: 'Placed' })}
                className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5 text-left transition hover:bg-sky-100/70"
              >
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/80">
                    <Briefcase className="h-5 w-5 text-sky-600" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-sky-700">Placed</span>
                </div>
                <div className="mt-5 text-3xl font-black text-sky-700">{adminData.learnerProgressSummary.placedCount}</div>
                <p className="mt-1 text-sm font-bold text-sky-800/70">Learners currently placed</p>
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">Owned Cases</p>
                <p className="mt-2 text-3xl font-black text-gray-900">{adminData.learnerProgressSummary.ownershipSummary.assignedCount}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">Learners already assigned to a responsible officer</p>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-amber-500">Unassigned</p>
                <p className="mt-2 text-3xl font-black text-amber-700">{adminData.learnerProgressSummary.ownershipSummary.unassignedCount}</p>
                <p className="mt-1 text-sm font-medium text-amber-700/80">Learners with no owner assigned</p>
              </div>
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-red-500">At-Risk Owned</p>
                <p className="mt-2 text-3xl font-black text-red-700">{adminData.learnerProgressSummary.ownershipSummary.atRiskOwnedCount}</p>
                <p className="mt-1 text-sm font-medium text-red-700/80">At-risk learners already sitting with an owner</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {adminData.learnerQualitySummary && (
        <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Attendance Compliance</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    Cadence-based attendance compliance across active placements.
                  </CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/attendance-logs')}>
                  Open Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Active Placements</p>
                  <p className="mt-4 text-3xl font-black text-indigo-700">{adminData.learnerQualitySummary.activeLearnerCount}</p>
                  <p className="mt-1 text-sm font-bold text-indigo-800/70">Learners currently in WEL</p>
                </div>
                <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">Overdue Rate</p>
                  <p className="mt-4 text-3xl font-black text-amber-700">{adminData.learnerQualitySummary.overdueAttendanceRate}%</p>
                  <p className="mt-1 text-sm font-bold text-amber-800/70">Placements behind attendance cadence</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Compliant</p>
                  <p className="mt-4 text-3xl font-black text-emerald-700">{Math.max(0, 100 - adminData.learnerQualitySummary.overdueAttendanceRate)}%</p>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Active placements on time</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Monitoring Quality & GPS</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    Monitoring coverage, site verification, and average observed performance.
                  </CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/monitoring-visits')}>
                  Open Visits
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-sky-700">Coverage</p>
                  <p className="mt-4 text-3xl font-black text-sky-700">{adminData.learnerQualitySummary.monitoringCoverageRate}%</p>
                  <p className="mt-1 text-sm font-bold text-sky-800/70">Placements with monitoring in cadence</p>
                </div>
                <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">GPS Verified</p>
                  <p className="mt-4 text-3xl font-black text-violet-700">{adminData.learnerQualitySummary.gpsVerifiedRate}%</p>
                  <p className="mt-1 text-sm font-bold text-violet-800/70">Active placements with verified visit evidence</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Avg Rating</p>
                  <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.avgVisitRating}</p>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Latest monitoring performance rating</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Assessment Outcomes</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    Competency assessment completion and score trend over the last 6 months.
                  </CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl border-gray-200 font-bold" onClick={() => navigate('/assessments')}>
                  Open Assessments
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">Completion</p>
                  <p className="mt-4 text-3xl font-black text-violet-700">{adminData.learnerQualitySummary.assessmentCompletionRate}%</p>
                  <p className="mt-1 text-sm font-bold text-violet-800/70">Active placements with at least one assessment</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Avg Score</p>
                  <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.avgAssessmentScore}</p>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Average latest assessment score</p>
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">6-Month Assessment Score Trend</p>
                  <p className="text-xs font-bold text-gray-500">Average score by month</p>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={adminData.learnerQualitySummary.assessmentScoreTrend}>
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}
                        formatter={(value: number, name: string) => [value, name === 'avgScore' ? 'Avg score' : 'Count']}
                      />
                      <Line type="monotone" dataKey="avgScore" stroke="#7c3aed" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: '#7c3aed' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="p-4 md:p-8 pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl font-black">Employer Evaluation Outcomes</CardTitle>
                  <CardDescription className="text-sm font-bold text-gray-400 mt-1">
                    Employer feedback coverage, average score, and willingness to hire.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-blue-700">Coverage</p>
                  <p className="mt-4 text-3xl font-black text-blue-700">{adminData.learnerQualitySummary.employerEvaluationCoverageRate}%</p>
                  <p className="mt-1 text-sm font-bold text-blue-800/70">Active placements with employer feedback</p>
                </div>
                <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">Avg Score</p>
                  <p className="mt-4 text-3xl font-black text-amber-700">{adminData.learnerQualitySummary.avgEmployerScore}</p>
                  <p className="mt-1 text-sm font-bold text-amber-800/70">Average latest employer rating</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Would Hire</p>
                  <p className="mt-4 text-3xl font-black text-emerald-700">{adminData.learnerQualitySummary.wouldHireRate}%</p>
                  <p className="mt-1 text-sm font-bold text-emerald-800/70">Positive hire intent among evaluated learners</p>
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">6-Month Employer Trend</p>
                  <p className="text-xs font-bold text-gray-500">Would-hire rate by month</p>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={adminData.learnerQualitySummary.employerOutcomeTrend}>
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}
                        formatter={(value: number, name: string) => [value, name === 'wouldHireRate' ? 'Would hire %' : 'Avg score']}
                      />
                      <Line type="monotone" dataKey="wouldHireRate" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

  </section>
}
