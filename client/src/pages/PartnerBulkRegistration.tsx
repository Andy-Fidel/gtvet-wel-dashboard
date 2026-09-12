import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

type Result = { row: number; name: string; status: 'Ready' | 'Created' | 'Skipped'; message: string }
type Summary = { results: Result[]; created: number; ready: number; skipped: number }
const template = 'name,sector,region,totalSlots,district,tradeArea,town,location,contactPerson,contactPhone,contactEmail,website,status,latitude,longitude\r\n';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PartnerBulkRegistration({ onImported }: { onImported: () => Promise<void> }) {
  const { authFetch } = useAuth()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [imported, setImported] = useState(false)

  const run = async (preview: boolean) => {
    setBusy(true)
    try {
      if (!file) throw new Error('Select a CSV file first')
      if (file.size > 1024 * 1024) throw new Error('File must be 1 MB or smaller')
      const content = preview ? await file.text() : csv
      const response = await authFetch('/api/industry-partners/import-csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: content, preview }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Bulk registration failed')
      setCsv(content)
      setSummary(payload)
      setImported(!preview)
      if (!preview) {
        toast.success(`${payload.created} partners registered; ${payload.skipped} rows skipped`)
        await onImported()
      }
    } catch (error) {
      setSummary(null)
      toast.error(error instanceof Error ? error.message : 'Bulk registration failed')
    } finally { setBusy(false) }
  }

  const exportResults = () => {
    const escape = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`
    download(['Row,Company,Status,Details', ...(summary?.results || []).map(row =>
      [row.row, row.name, row.status, row.message].map(escape).join(','))].join('\r\n'), 'partner-registration-results.csv')
  }

  return <>
    <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setOpen(true)}>Bulk Register Partners</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-[850px]">
        <DialogHeader>
          <DialogTitle>Bulk Register Industry Partners</DialogTitle>
          <DialogDescription>Upload a CSV containing up to 500 partners (1 MB maximum). Valid partners are approved immediately. Existing companies and invalid rows are skipped.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-gray-600">Required columns: name, sector, region. Capacity defaults to 0 and status to Active. Use a Ghana region name and keep phone numbers as text in Excel. Portal accounts can be created separately after registration.</p>
        <Button variant="outline" onClick={() => download(template, 'industry-partners-template.csv')}>Download CSV Template</Button>
        <label htmlFor="partner-import-file" className="text-sm font-semibold">Partners CSV file</label>
        <Input id="partner-import-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
          setFile(event.target.files?.[0] || null); setSummary(null); setCsv(''); setImported(false)
        }} />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={busy || !file} onClick={() => void run(true)}>{busy ? 'Processing…' : 'Preview and Validate'}</Button>
          {summary && !imported && <Button disabled={busy || !summary.ready} onClick={() => void run(false)}>Register {summary.ready} Valid Partners</Button>}
          {summary && <Button variant="outline" disabled={busy} onClick={exportResults}>Download Results</Button>}
        </div>
        {summary && <div aria-live="polite" className="space-y-3">
          <p className="font-semibold">{imported ? `${summary.created} registered` : `${summary.ready} ready`} · {summary.skipped} skipped · {summary.results.length} total</p>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-100"><tr>{['Row', 'Company', 'Status', 'Details'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{summary.results.map(row => <tr key={row.row} className="border-t"><td className="p-3">{row.row}</td><td className="p-3">{row.name || 'Unnamed'}</td><td className="p-3">{row.status}</td><td className="p-3">{row.message}</td></tr>)}</tbody>
            </table>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </>
}
