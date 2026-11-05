export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  const safe = typeof value !== 'number' && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
export function encodeCsv(rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
