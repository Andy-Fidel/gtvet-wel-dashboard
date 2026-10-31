import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import type { Learner } from '@/pages/learners/columns'
import { downloadLearnerRegister, type LearnerExportRequest, type LearnerExportScope } from '@/lib/learnerRegisterExport'

export function LearnerRegisterExportDialog({ request, onClose }: { request: LearnerExportRequest; onClose: () => void }) {
  const { authFetch } = useAuth()
  const hasFilters = Boolean(request.filters)
  const [scope, setScope] = useState<LearnerExportScope>(hasFilters ? 'filtered' : 'all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const close = () => { controller.current?.abort(); onClose() }
  const exportRegister = async () => {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    setError('')
    try {
      let rows = request.currentPage
      if (scope !== 'page') {
        // Omitting page and pageSize uses the API's all-records response, under the same server-side access scope.
        const query = scope === 'filtered' ? request.filters : ''
        const response = await authFetch(`/api/learners${query ? `?${query}` : ''}`, { signal: current.signal })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Unable to load learners for export. Please try again.')
        if (!Array.isArray(payload)) throw new Error('The complete register could not be loaded. Please try again.')
        rows = payload as Learner[]
      }
      current.signal.throwIfAborted()
      if (!rows.length) throw new Error('No learners match this export scope. Choose another scope or update the filters.')
      await downloadLearnerRegister(request, rows, scope, current.signal)
      if (!current.signal.aborted) onClose()
    } catch (err) {
      if (!current.signal.aborted) setError(err instanceof Error ? err.message : 'Export failed. Please try again.')
    } finally {
      if (!current.signal.aborted) { controller.current = null; setBusy(false) }
    }
  }
  const filters = [...new URLSearchParams(request.filters)].map(([key, value]) => `${key === 'institution' ? 'School' : key}: ${value}`).join(' · ')
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader className="text-left">
        <DialogTitle className="pr-10 text-xl leading-tight sm:text-2xl">Export learner register to {request.format.toUpperCase()}</DialogTitle>
        <DialogDescription>Choose which learners to include. Every option respects your access scope and uses the visible table columns.</DialogDescription>
      </DialogHeader>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Export scope</legend>
        {([
          ['all', 'Whole register', 'Every learner you can access, across all pages. Ignores search and register filters.'],
          ['filtered', 'Filtered results', hasFilters ? `Every matching learner across all pages. ${filters}` : 'No active filters; includes every learner you can access.'],
          ['page', 'Current page', `${request.currentPage.length} learners currently shown, in their displayed order.`],
        ] as const).map(([value, title, description]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${scope === value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
          <input type="radio" name="learner-export-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1 accent-indigo-600" />
          <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block break-words text-sm text-gray-600">{description}</span></span>
        </label>)}
      </fieldset>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <p role="status" className="text-sm text-gray-600">{busy ? 'Preparing your complete export. You can cancel while it loads.' : 'Large registers may take a moment to prepare.'}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>Cancel</Button>
        <Button className="bg-[#FFB800] text-slate-950 hover:bg-[#E5A600]" disabled={busy || (scope === 'page' && !request.currentPage.length)} onClick={exportRegister}>{busy ? 'Preparing…' : `Download ${request.format.toUpperCase()}`}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
