import type { Learner } from '@/pages/learners/columns'
import type { TableExportRequest } from '@/components/ui/data-table'

export type LearnerExportScope = 'all' | 'filtered' | 'page'
export type LearnerExportRequest = TableExportRequest<Learner> & { filters: string }

export async function downloadLearnerRegister(request: LearnerExportRequest, rows: Learner[], scope: LearnerExportScope, signal: AbortSignal) {
  const labels = { all: 'Whole register (within your access scope)', filtered: 'All matching learners', page: 'Current page' }
  const filename = `learner-register-${scope}-${new Date().toISOString().slice(0, 10)}`
  const values = request.values(rows)
  if (request.format === 'csv') {
    const cell = (value: string) => {
      const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value
      return `"${safe.replace(/"/g, '""')}"`
    }
    const csv = '\uFEFF' + [request.headers, ...values].map(row => row.map(cell).join(',')).join('\r\n')
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
  doc.text('Learner Register', 14, 16)
  doc.setFontSize(9)
  const criteria = scope === 'all' ? 'No search or register filters applied.' : new URLSearchParams(request.filters).toString() ? [...new URLSearchParams(request.filters)].map(([key, value]) => `${key}: ${value}`).join(' · ') : 'No active filters.'
  const context = doc.splitTextToSize(`${labels[scope]} · ${rows.length} learners\n${criteria}\nGenerated ${new Date().toISOString()}`, 265)
  doc.text(context, 14, 23)
  autoTable(doc, {
    startY: 26 + context.length * 4,
    head: [request.headers], body: values, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [79, 70, 229] }, margin: { bottom: 16 },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.text(`Page ${doc.getNumberOfPages()}`, 14, doc.internal.pageSize.height - 7)
    },
  })
  signal.throwIfAborted()
  doc.save(`${filename}.pdf`)
}
