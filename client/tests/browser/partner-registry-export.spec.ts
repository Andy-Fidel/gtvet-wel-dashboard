import { test, expect, type Page, type Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function contents(download: Download) {
  return readFile((await download.path())!)
}

async function setup(page: Page, options: { failExport?: boolean; empty?: boolean } = {}) {
  const exports: URLSearchParams[] = []
  const partners = Array.from({ length: 45 }, (_, index) => ({
    _id: String(index), name: `Export Partner ${String(index + 1).padStart(3, '0')}`,
    sector: 'Automotive', region: 'Ashanti', town: 'Kumasi', location: 'Workshop near the main road',
    contactPerson: index === 0 ? '=HYPERLINK("example.test")' : 'Ama "Adwoa", Mensah\nSupervisor',
    contactEmail: 'contact@example.test', contactPhone: '0240000000',
    totalSlots: 10, usedSlots: 0, status: 'Active', programs: [],
    partnerType: 'RegisteredCompany',
    // Legacy partners without approvalStatus are treated as approved.
  }))
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:qa-user', 'seen'))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'qa-user', name: 'HQ reviewer', role: 'HQManager', status: 'Active', hqScopeType: 'National' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path === '/api/industry-partners') {
      if (!url.searchParams.has('page')) {
        exports.push(url.searchParams)
        if (options.failExport) return route.fulfill({ status: 500, json: { message: 'Export failed' } })
        return route.fulfill({ json: options.empty ? [] : partners })
      }
      return route.fulfill({ json: { items: options.empty ? [] : partners.slice(0, 18), total: options.empty ? 0 : 45, totalPages: options.empty ? 0 : 3, summary: { total: 45, approved: 45, pending: 0, rejected: 0 } } })
    }
    if (path === '/api/hq/partner-insights') return route.fulfill({ json: { summary: {}, regions: [], sectors: [], placements: [], requests: [] } })
    if (path === '/api/partner-change-requests' || path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/hq-industry-partners')
  return exports
}

test('CSV exports every filtered partner with safe spreadsheet cells and escaped contact details', async ({ page }) => {
  const exports = await setup(page)
  await page.getByPlaceholder('Search company, sector, contact...').fill('Export')
  await page.getByRole('button', { name: 'Approved', exact: true }).click()
  const button = page.getByRole('button', { name: 'Export CSV', exact: true })
  await expect(button).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await button.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^industry-partners-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = (await contents(download)).toString('utf8')
  expect(csv.startsWith('\uFEFF')).toBe(true)
  expect(csv).toContain('Export Partner 045')
  expect(csv).toContain('"\'=HYPERLINK(""example.test"")"')
  expect(csv).toContain('"Ama ""Adwoa"", Mensah\nSupervisor"')
  expect(csv).toContain('"Approved","Active","10","0"')
  expect(exports).toHaveLength(1)
  expect(Object.fromEntries(exports[0])).toEqual({ includeAll: '1', q: 'Export', approvalStatus: 'Approved' })
})

test('PDF downloads all partners in a multipage report with filters and page numbers', async ({ page }, testInfo) => {
  await setup(page)
  const button = page.getByRole('button', { name: 'Export PDF', exact: true })
  await expect(button).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await button.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const pdf = (await contents(download)).toString('latin1')
  expect(pdf.startsWith('%PDF-')).toBe(true)
  expect(pdf).toContain('HQ Industry Partner Registry')
  expect(pdf).toContain('Partners: 45')
  expect(pdf).toContain('Approval: All | Search: All partners')
  expect(pdf).toContain('Export Partner 045')
  expect(pdf).toMatch(/Page 2 of \d+/)
  await download.saveAs(testInfo.outputPath('partner-registry.pdf'))
})

test('export failures are reported and allow retry', async ({ page }) => {
  await setup(page, { failExport: true })
  const button = page.getByRole('button', { name: 'Export CSV', exact: true })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(page.getByText('Unable to load partners for export. Please try again.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close error message', exact: true }).click()
  await expect(button).toBeEnabled()
})

test('empty registry disables both exports', async ({ page }) => {
  await setup(page, { empty: true })
  await expect(page.getByText('No partners match the current filters.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeDisabled()
})
