import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { auditTimestamp, type AuditLogEntry } from '@/lib/audit-log'

const fields = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const displayValue = (value: unknown) => {
  if (value === undefined) return 'Not captured'
  if (value === null) return 'null'
  if (value === '') return '(empty text)'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export function AuditEventDetails({ entry, onClose, onRestoreFocus }: { entry: AuditLogEntry | null; onClose: () => void; onRestoreFocus: () => void }) {
  const before = fields(entry?.beforeData)
  const after = fields(entry?.afterData)
  const changed = [...new Set([
    ...(entry?.changedFields || []),
    ...Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])),
    ...Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])),
  ])]
  return (
    <Dialog open={Boolean(entry)} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-4xl sm:rounded-2xl motion-reduce:animate-none" overlayClassName="motion-reduce:animate-none" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus() }}>
        {entry && <>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl">{entry.summary}</DialogTitle>
            <DialogDescription>{entry.actorName} · {entry.actorRole} · {auditTimestamp(entry.createdAt)}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-1 gap-4 rounded-xl border bg-gray-50 p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-gray-500">Institution</dt><dd className="mt-1 font-medium break-words">{entry.institution || 'Not recorded'}</dd></div>
            <div><dt className="text-gray-500">Entity</dt><dd className="mt-1 font-medium break-words">{entry.entityType}<span className="mt-1 block font-mono text-xs">{entry.entityId}</span></dd></div>
            <div><dt className="text-gray-500">Event ID</dt><dd className="mt-1 break-all font-mono text-xs">{entry._id}</dd></div>
          </dl>
          <section aria-label="Field changes">
            <h3 className="mb-3 font-semibold">Field changes</h3>
            {changed.length ? <Table>
              <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Previous value</TableHead><TableHead>New value</TableHead></TableRow></TableHeader>
              <TableBody>{changed.map(key => <TableRow key={key}>
                <TableCell className="align-top font-medium">{key}</TableCell>
                <TableCell className="max-w-72 align-top"><pre className="whitespace-pre-wrap break-words text-xs">{displayValue(before[key])}</pre></TableCell>
                <TableCell className="max-w-72 align-top"><pre className="whitespace-pre-wrap break-words text-xs">{displayValue(after[key])}</pre></TableCell>
              </TableRow>)}</TableBody>
            </Table> : <p className="rounded-xl border border-dashed p-4 text-sm text-gray-500">No field changes were captured for this event. Additional context may be available in metadata.</p>}
          </section>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2">Event metadata</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry.metadata ?? {}, null, 2)}</pre>
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2">Technical details and raw data</summary>
            <p className="my-3 break-all text-xs text-gray-600">{entry.method} {entry.route}</p>
            <div className="grid gap-4 sm:grid-cols-2">{[['Before', entry.beforeData], ['After', entry.afterData]].map(([label, value]) => <div key={String(label)}>
              <h4 className="mb-2 text-sm font-medium">{String(label)}</h4>
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs">{value === undefined ? 'Not captured' : JSON.stringify(value, null, 2)}</pre>
            </div>)}</div>
          </details>
        </>}
      </DialogContent>
    </Dialog>
  )
}
