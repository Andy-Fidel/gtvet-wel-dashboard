import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent } from '@/components/ui/card'

export default function HQDashboard() {
  const { user, authFetch } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['hq-overview', user?._id],
    queryFn: async () => {
      const response = await authFetch('/api/admin/overview')
      if (!response.ok) throw new Error('Unable to load HQ overview')
      return response.json() as Promise<Record<string, number>>
    },
  })
  return <div className="space-y-6 p-8">
    <h1 className="text-3xl font-black">HQ Overview</h1>
    <p className="text-muted-foreground">{user?.role === 'HQManager'
      ? 'National oversight and approvals for term reports and industry partners.'
      : 'Read-only national oversight of institutions, learners, and operations.'}</p>
    {error ? <p role="alert">{error.message}</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries({ totalInstitutions: 'Institutions', totalLearners: 'Learners', totalPlacements: 'Placements', totalPartners: 'Industry Partners' }).map(([key, label]) =>
        <Card key={key}><CardContent className="p-6"><p>{label}</p><p className="mt-2 text-3xl font-bold">{isLoading ? '…' : (data?.[key] ?? 0).toLocaleString()}</p></CardContent></Card>)}
    </div>}
    <div className="grid gap-4 sm:grid-cols-2">
      {[['/semester-reports', 'Term Reports'], ['/hq-industry-partners', 'Partner Registry'], ['/monitoring-visits', 'Monitoring Reviews'], ['/assessments', 'Assessments']].map(([to, label]) =>
        <Link key={to} to={to} className="rounded-2xl border bg-white p-6 font-bold hover:bg-slate-50">{label} →</Link>)}
    </div>
  </div>
}
