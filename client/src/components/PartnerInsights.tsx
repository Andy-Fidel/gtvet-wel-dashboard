import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

type Group = { _id: string; count: number; requestedSlots?: number; oldestCreatedAt?: string }
type Insights = {
  generatedAt: string; scope: string; scopeName: string
  summary: Record<string, number>
  regions: Group[]; sectors: Group[]; placements: Group[]; requests: Group[]
}
const number = (value = 0) => value.toLocaleString()
const chartColors = ['#0f766e', '#f59e0b', '#2563eb', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#475569']

export function PartnerInsights() {
  const { authFetch, user } = useAuth()
  const query = useQuery<Insights>({
    queryKey: ['partner-insights', user?._id],
    queryFn: async ({ signal }) => {
      const response = await authFetch('/api/hq/partner-insights', { signal })
      if (!response.ok) throw new Error('Unable to load partner insights')
      return response.json()
    },
  })
  if (query.isPending) return <p role="status">Loading partner insights…</p>
  if (query.isError) return <div role="alert">Partner insights could not be loaded. <Button onClick={() => void query.refetch()}>Retry</Button></div>
  const data = query.data
  const s = data.summary
  const active = data.placements.find(row => row._id === 'Active')?.count || 0
  const open = data.requests.filter(row => ['Submitted', 'SelfSourced_Submitted', 'Regional_Approved', 'HQ_Approved', 'Under_Verification', 'Approved'].includes(row._id))
  const donut = (title: string, rows: Group[]) => {
    const chartData = rows.map(row => ({ name: row._id || 'Unspecified', value: row.count }))
    return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      {!chartData.length ? <p className="text-muted-foreground">No partners in this scope.</p> : <div className="h-[290px] w-full" aria-label={`${title} donut chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="43%" innerRadius={58} outerRadius={92} paddingAngle={2} strokeWidth={1}>
              {chartData.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={chartColors[index % chartColors.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [number(value), name]} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }} />
            <Legend iconType="circle" formatter={(value) => <span className="text-xs text-foreground">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>}
    </CardContent></Card>
  }
  return <section className="space-y-4" aria-label="Partner and industry insights">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-bold">Partner & industry insights</h3><p className="text-sm text-muted-foreground">{data.scopeName || data.scope} scope · Updated {new Date(data.generatedAt).toLocaleString()}</p></div><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Refreshing…' : 'Refresh insights'}</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Registered partners', s.total], ['Partners with placements', s.partnersWithPlacements], ['Reported slots', s.reportedSlots], ['Active placements', active], ['Open requests', open.reduce((sum, row) => sum + row.count, 0)],
    ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{number(Number(value) || 0)}</p></CardContent></Card>)}</div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Reported slots are registry totals, not verified availability. Verified capacity and reserved slots are not yet tracked. Partner counts follow the partner registry scope; placements and requests follow institution access. All periods are included; archived operations are excluded.</p>
    <div className="grid gap-4 lg:grid-cols-2">{donut('Partners by region', data.regions)}{donut('Partners by sector', data.sectors)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Placement request progress</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Requests by current status</caption><thead><tr><th className="pb-3">Status</th><th>Requests</th><th>Slots requested</th></tr></thead><tbody>{data.requests.map(row => <tr key={row._id} className="border-t"><td className="py-3">{row._id.replaceAll('_', ' ')}</td><td>{row.count}</td><td>{row.requestedSlots}</td></tr>)}</tbody></table>{!data.requests.length && <p>No requests in this scope.</p>}<p className="mt-4 text-xs text-muted-foreground">Requests can include multiple learners. Requested slots may overlap across requests and are not reservations.</p>{open.map(row => <p key={row._id} className="mt-2 text-sm">Oldest {row._id.replaceAll('_', ' ').toLowerCase()}: {row.oldestCreatedAt ? new Date(row.oldestCreatedAt).toLocaleDateString() : 'Date unavailable'}</p>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Partner records needing attention</CardTitle></CardHeader><CardContent className="space-y-3">{[
      ['Awaiting HQ approval', s.pendingApproval], ['Programme eligibility missing', s.missingPrograms], ['District missing', s.missingDistrict], ['Email missing', s.missingEmail], ['MoU document missing', s.missingMou],
    ].map(([label, count]) => <div className="flex justify-between gap-3 border-b pb-2 text-sm" key={String(label)}><span>{label}</span><strong>{number(Number(count) || 0)}</strong></div>)}<p className="text-xs text-muted-foreground">A partner may appear in multiple categories. Missing records do not establish that an agreement or contact does not exist.</p></CardContent></Card></div>
  </section>
}
