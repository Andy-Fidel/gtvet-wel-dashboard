import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const HQ_ACTION_CATEGORIES = ['All', 'Reports', 'Support', 'Deadlines', 'Governance', 'Data quality'] as const
export type HqActionCategory = typeof HQ_ACTION_CATEGORIES[number]
export interface HQActionItem {
  id: string
  category: HqActionCategory
  priority: 'Critical' | 'High' | 'Medium'
  title: string
  institution: string
  owner: string
  timing: string
  nextAction: string
  target: string
  affectedRecords: number
  unassigned: boolean
}
export interface ActionCentrePage {
  items: HQActionItem[]
  category: HqActionCategory
  page: number
  pageSize: number
  total: number
  totalPages: number
  totalActions: number
  critical: number
  unassigned: number
  categoryCounts: Record<string, number>
}
export function HQActionQueue({ queue, category, busy, onFilter, onPage, onOpen }: {
  queue?: ActionCentrePage
  category: string
  busy: boolean
  onFilter: (category: HqActionCategory) => void
  onPage: (page: number) => void
  onOpen: (target: string) => void
}) {
  return <section id="hq-action-centre" data-help-id="hq-action-centre" className="hq-actions rounded-2xl border border-slate-200 bg-white" aria-label="HQ work queue" aria-busy={busy}>
    <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-xl font-semibold text-slate-950">Prioritized work</h3><p className="mt-1 text-sm text-slate-600">Individual requests and grouped exceptions within your access scope.</p></div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <span><strong className="text-lg tabular-nums text-slate-950">{queue?.totalActions ?? '—'}</strong> queue items</span>
          <span><strong className="text-lg tabular-nums text-red-700">{queue?.critical ?? '—'}</strong> critical</span>
          <span><strong className="text-lg tabular-nums text-amber-800">{queue?.unassigned ?? '—'}</strong> unassigned tickets</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter HQ actions">{HQ_ACTION_CATEGORIES.map(name => <button key={name} type="button" aria-pressed={category === name} onClick={() => onFilter(name)} className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium ${category === name ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{name} <span className="ml-1 tabular-nums">{queue?.categoryCounts[name] ?? 0}</span></button>)}</div>
    </div>
    <div className="p-3 sm:p-4">
      {!queue ? <p role="status" className="p-4 text-sm text-slate-600">Queue information is unavailable. Refresh to try again.</p> : queue.items.length ? <ul className="divide-y divide-slate-100">{queue.items.map(item => <li key={item.id}>
        <button type="button" onClick={() => onOpen(item.target)} aria-label={`${item.nextAction}: ${item.title}`} className="hq-action-row block w-full rounded-lg px-2 py-4 text-left hover:bg-slate-50">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md border px-2 py-0.5 font-semibold ${item.priority === 'Critical' ? 'border-red-200 bg-red-50 text-red-800' : item.priority === 'High' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{item.priority}</span>
            <span className="text-slate-600">{item.category} · {item.institution}</span>
            {item.affectedRecords > 1 ? <span className="text-slate-600">Group of {item.affectedRecords} records</span> : null}
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-950">{item.title}</p>
          <div className="mt-2 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5">
            <span>{item.unassigned ? 'Ownership: ' : 'Responsible queue / owner: '}<strong className={item.unassigned ? 'font-medium text-red-700' : 'font-medium text-slate-700'}>{item.owner}</strong></span>
            <span>{item.timing}</span>
          </div>
          <span className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-indigo-800">{item.nextAction}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></span>
        </button>
      </li>)}</ul> : <div className="rounded-xl bg-slate-50 p-6 text-center"><p className="font-medium text-slate-900">No matching queue items</p><p className="mt-1 text-sm text-slate-600">{category === 'All' ? 'No outstanding items were identified in the evaluated workflows.' : 'Choose another category to review other work.'}</p></div>}
      {queue ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-600" role="status">{busy ? 'Updating queue…' : `Showing ${queue.total ? (queue.page - 1) * queue.pageSize + 1 : 0}–${Math.min(queue.page * queue.pageSize, queue.total)} of ${queue.total} items`}</p>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={busy || queue.page <= 1} onClick={() => onPage(queue.page - 1)} aria-label="Previous action page"><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-slate-700">Page {queue.page} of {queue.totalPages}</span><Button variant="outline" size="sm" disabled={busy || queue.page >= queue.totalPages} onClick={() => onPage(queue.page + 1)} aria-label="Next action page"><ChevronRight className="h-4 w-4" /></Button></div>
      </div> : null}
    </div>
  </section>
}
