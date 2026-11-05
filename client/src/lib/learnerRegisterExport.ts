import { encodeCsv } from './csv'
import type { Learner } from '@/pages/learners/columns'
import type { TableExportRequest } from '@/components/ui/data-table'

export type LearnerExportScope = 'all' | 'filtered' | 'page'
export type LearnerExportRequest = TableExportRequest<Learner> & { filters: string }

export type ScopedExportRequest<T> = TableExportRequest<T> & { filters: string; detailColumns?: string[] }

export async function downloadScopedRegister<T>(request: ScopedExportRequest<T>, rows: T[], scope: LearnerExportScope, signal: AbortSignal, report: { title: string; filename: string; noun: string }) {
  const labels = { all: 'Whole register (within your access scope)', filtered: 'All matching records', page: 'Current page' }
  const filename = `${report.filename}-${scope}-${new Date().toISOString().slice(0, 10)}`
  const values = request.values(rows)
  if (request.format === 'csv') {
    const csv = encodeCsv([request.headers, ...values])
    signal.throwIfAborted()
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  signal.throwIfAborted()
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(15)
  doc.text(report.title, 14, 16)
  doc.setFontSize(9)
  const criteria = scope === 'all' ? 'No search or register filters applied.' : new URLSearchParams(request.filters).toString() ? [...new URLSearchParams(request.filters)].map(([key, value]) => `${key}: ${value}`).join(' · ') : 'No active filters.'
  const context = doc.splitTextToSize(`${labels[scope]} · ${rows.length} ${report.noun}\n${criteria}\nGenerated ${new Date().toISOString()}`, 265)
  doc.text(context, 14, 23)
  const detailIndices = request.headers.flatMap((header, index) => request.detailColumns?.includes(header) ? [index] : [])
  const headers = request.headers.filter((_, index) => !detailIndices.includes(index))
  const body = values.flatMap(row => {
    const summary = row.filter((_, index) => !detailIndices.includes(index))
    if (!detailIndices.length || !headers.length) return [row]
    const notes = detailIndices.map(index => `${request.headers[index]}: ${row[index] || 'Not recorded'}`).join('\n')
    return [summary, [{ content: notes, colSpan: headers.length, styles: { fillColor: '#f5f7fb' } }]]
  })
  autoTable(doc, {
    startY: 26 + context.length * 4,
    head: [headers.length ? headers : request.headers], body, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [79, 70, 229] }, margin: { bottom: 16 }, showHead: 'everyPage',
    rowPageBreak: 'avoid',
  })
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.text(`Page ${page} of ${pages}`, 14, doc.internal.pageSize.height - 7)
  }
  signal.throwIfAborted()
  doc.save(`${filename}.pdf`)
}
