import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
const labels: Record<string, string> = {
  'stale-pending': 'Pending learners registered at least 14 days ago',
  'missing-supervisor': 'Active placements missing a supervisor name or both phone and email',
  'unsigned-overdue': 'Pending attendance entries submitted at least three days ago',
  'unvisited-placement': 'Active placements started at least 14 days ago with no visit recorded for this placement',
}
export function ExceptionFilterNotice() {
  const [params, setParams] = useSearchParams()
  const label = labels[params.get('exception') || '']
  if (!label) return null
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span>Exception filter: {label}</span><Button size="sm" variant="outline" onClick={() => { const next = new URLSearchParams(params); next.delete('exception'); next.delete('page'); setParams(next, { replace: true }) }}>Clear exception filter</Button></div>
}
