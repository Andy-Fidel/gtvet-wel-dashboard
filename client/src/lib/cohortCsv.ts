import { csvCell, encodeCsv } from './csv'

export const cohortCsvCell = csvCell

export function exportCohortCsv(rows: unknown[][]) {
  const csv = encodeCsv(rows)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `cohort-comparison-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
