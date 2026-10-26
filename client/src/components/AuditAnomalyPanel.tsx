import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AuditAnomalies, AuditFilters } from '@/lib/audit-log'

export function AuditAnomalyPanel({ data, loading, error, onRetry, onInvestigate }: {
  data: AuditAnomalies | null
  loading: boolean
  error: string
  onRetry: () => void
  onInvestigate: (filters: Partial<AuditFilters>) => void
}) {
  const window = () => {
    const now = new Date()
    const since = new Date(now)
    since.setUTCDate(since.getUTCDate() - (data?.windowDays ?? 30))
    return { dateFrom: since.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) }
  }
  const view = (filters: Partial<AuditFilters>) => onInvestigate({ ...window(), ...filters })
  const count = data ? data.deleteSpikes.length + data.failedAuthActors.length + data.massUpdates.length : 0
  return <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
    <summary className="cursor-pointer rounded-2xl p-4 font-semibold focus-visible:outline focus-visible:outline-2 sm:p-5">
      <span className="inline-flex items-center gap-2"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600" />
        Audit signals <span className="font-normal text-gray-500">{loading ? '· Updating…' : error ? '· Unavailable' : `· ${count} signals in the last ${data?.windowDays ?? 30} days`}</span>
      </span>
    </summary>
    <div className="space-y-4 border-t border-gray-200 p-4 sm:p-5">
      <p className="text-sm text-gray-500">Signals cover your authorized scope independently of the event filters. They are indicators for review, not confirmed incidents. Investigation dates use UTC calendar days.</p>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">{error}<Button variant="outline" size="sm" onClick={onRetry}>Retry signals</Button></div>}
      {data && <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-4"><h3 className="font-semibold">Delete spikes</h3>
          {!data.deleteSpikes.length && <p className="mt-2 text-sm text-gray-500">No unusual delete spikes detected.</p>}
          {data.deleteSpikes.map(entry => <div key={`${entry.institution}-${entry.date}`} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-sm font-medium">{entry.institution} · {entry.count} deletes</p>
            <p className="text-xs text-gray-500">{entry.date} · {entry.severity} signal</p>
            <Button variant="outline" size="sm" onClick={() => view({ institution: entry.institution, action: 'DELETE', dateFrom: entry.date, dateTo: entry.date })}>View matching events</Button>
          </div>)}
        </section>
        <section className="rounded-xl border p-4"><h3 className="font-semibold">Repeated failed authentication</h3>
          {!data.failedAuthActors.length && <p className="mt-2 text-sm text-gray-500">No repeated failed authentication patterns detected.</p>}
          {data.failedAuthActors.map((entry, index) => <div key={`${entry.actorId || entry.actorName}-${entry.institution}-${index}`} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-sm font-medium">{entry.actorName} · {entry.count} failures</p><p className="text-xs text-gray-500">{entry.institution}</p>
            <Button variant="outline" size="sm" onClick={() => view({ institution: entry.institution, action: 'AUTH', outcome: 'FAILED', ...(entry.actorId ? { actorId: entry.actorId } : { actorName: entry.actorName }) })}>View matching events</Button>
          </div>)}
          {data.failedAuthInstitutions.map(entry => <div key={entry.institution} className="mt-3 border-t border-gray-200 pt-3">
            <p className="mb-2 text-sm">{entry.institution} · {entry.count} failures across actors</p>
            <Button variant="outline" size="sm" onClick={() => view({ institution: entry.institution, action: 'AUTH', outcome: 'FAILED' })}>View institution failures</Button>
          </div>)}
        </section>
        <section className="rounded-xl border p-4"><h3 className="font-semibold">Mass update signals</h3>
          {!data.massUpdates.length && <p className="mt-2 text-sm text-gray-500">No sudden mass updates detected.</p>}
          {data.massUpdates.map((entry, index) => <div key={`${entry.actorId || entry.actorName}-${entry.institution}-${index}`} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-sm font-medium">{entry.actorName} · {entry.count} updates</p><p className="text-xs text-gray-500">{entry.institution} · {entry.severity} signal</p>
            <Button variant="outline" size="sm" onClick={() => view({ institution: entry.institution, action: 'UPDATES', ...(entry.actorId ? { actorId: entry.actorId } : { actorName: entry.actorName }) })}>View matching events</Button>
          </div>)}
        </section>
        <section className="rounded-xl border p-4"><h3 className="font-semibold">Institutions to review</h3>
          <p className="mt-2 text-xs text-gray-500">Signal score: failures × 2 + delete spike days × 3 + update count.</p>
          {!data.riskyInstitutions.length && <p className="mt-2 text-sm text-gray-500">No elevated institution risk detected.</p>}
          {data.riskyInstitutions.map(entry => <div key={entry.institution} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-sm font-medium">{entry.institution} · score {entry.score}</p>
            <p className="text-xs text-gray-500">{entry.failedAuths} failed authentications · {entry.deleteSpikes} delete spike days</p>
            <Button variant="outline" size="sm" onClick={() => view({ institution: entry.institution })}>View institution events</Button>
          </div>)}
        </section>
      </div>}
    </div>
  </details>
}
