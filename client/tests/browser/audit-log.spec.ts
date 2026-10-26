import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }
import AxeBuilder from '@axe-core/playwright'

const actor = { _id: 'qa-audit-hq', name: 'QA HQ', email: 'hq@example.test', role: 'SuperAdmin', status: 'Active' }
const events = Array.from({ length: 23 }, (_, index) => ({
  _id: `event-${index}`, action: index % 2 ? 'CREATE' : 'UPDATE', entityType: 'Learner', entityId: `learner-${index}`,
  summary: `Updated learner record ${index}`, actorName: 'QA Officer', actorRole: 'Staff', actorId: '507f1f77bcf86cd799439011',
  institution: 'QA College', changedFields: ['status'], beforeData: { status: 'Pending' }, afterData: { status: 'Active' },
  metadata: { outcome: 'SUCCESS', note: 'Reviewed by HQ' }, route: '/api/learners', method: 'PUT', createdAt: '2026-10-26T12:30:45Z',
}))
const signals = {
  windowDays: 30, deleteSpikes: [{ institution: 'QA College', date: '2026-10-26', count: 5, severity: 'medium' }],
  failedAuthActors: [{ actorId: '507f1f77bcf86cd799439011', actorName: 'QA Officer', institution: 'QA College', count: 3 }],
  failedAuthInstitutions: [], massUpdates: [{ actorId: '507f1f77bcf86cd799439011', actorName: 'QA Officer', institution: 'QA College', count: 20, severity: 'medium' }],
  riskyInstitutions: [{ institution: 'QA College', score: 29, failedAuths: 3, deleteSpikes: 1 }],
}
async function setup(page: Page) {
  const requests: URL[] = [], exports: URL[] = [], errors: string[] = []
  let signalRequests = 0, failNext = false
  let releaseSlow: (() => void) | undefined
  const slowGate = new Promise<void>(resolve => { releaseSlow = resolve })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa-audit-hq', 'seen')
    localStorage.setItem('gtvets-release-read:v1:qa-audit-hq', latest)
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: actor })
    if (url.pathname === '/api/audit-logs/anomalies') { signalRequests++; return route.fulfill({ json: signals }) }
    if (url.pathname === '/api/audit-logs/export') {
      exports.push(url)
      return route.fulfill({ contentType: 'text/csv', body: 'Summary\nQA export\n' })
    }
    if (url.pathname === '/api/audit-logs') {
      requests.push(url)
      if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { message: 'Unavailable' } }) }
      const query = url.searchParams.get('search') || ''
      if (query === 'slow') await slowGate
      const filtered = events.filter(event => (!query || query === 'slow' || event.summary.includes(query)) && (!url.searchParams.get('action') || event.action === url.searchParams.get('action')))
      const currentPage = Number(url.searchParams.get('page') || 1)
      return route.fulfill({ json: {
        items: filtered.slice((currentPage - 1) * 10, currentPage * 10), total: filtered.length,
        stats: { total: filtered.length, creates: 11, updates: 12, deletes: 0 },
        entityOptions: ['Learner', 'User'], actorOptions: [{ actorId: '507f1f77bcf86cd799439011', actorName: 'QA Officer', actorRole: 'Staff' }],
      } }).catch(() => {})
    }
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } })
    if (url.pathname === '/api/institutions') return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })
  return { requests, exports, errors, signalRequests: () => signalRequests, fail: () => { failNext = true }, releaseSlow: () => releaseSlow?.() }
}
const eventsSection = (page: Page) => page.getByRole('region', { name: 'Audit events', exact: true })
const viewEvent = (page: Page, index: number) => page.getByRole('button', { name: `View event: Updated learner record ${index}`, exact: true })
async function ready(page: Page) {
  await page.goto('/activity-log')
  await expect(eventsSection(page).getByText('Showing 1–10 of 23 events')).toBeVisible()
}

test('all event pages remain reachable without refetching signals', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.screenshot({ path: test.info().outputPath('audit-log-desktop.png'), fullPage: true })
  const initialSignals = state.signalRequests()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 11–20 of 23 events')).toBeVisible()
  await expect(viewEvent(page, 10)).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 21–23 of 23 events')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(eventsSection(page).getByText('Page 2 of 3')).toBeVisible()
  expect(state.signalRequests()).toBe(initialSignals)
  expect(state.errors).toEqual([])
})

test('filters apply together, reset pagination, and exports use applied values', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(eventsSection(page).getByText('Page 2 of 3')).toBeVisible()
  const beforeDraft = state.requests.length
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('record 2')
  await page.getByRole('combobox', { name: 'Action', exact: true }).click()
  await page.getByRole('option', { name: 'Update', exact: true }).click()
  expect(state.requests).toHaveLength(beforeDraft)
  await expect(page.getByText('Unapplied changes. Apply filters to update results.')).toBeVisible()
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 1–3 of 3 events')).toBeVisible()
  expect(state.requests.at(-1)?.searchParams.get('page')).toBe('1')
  expect(state.requests.at(-1)?.searchParams.get('search')).toBe('record 2')
  expect(state.requests.at(-1)?.searchParams.get('action')).toBe('UPDATE')
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('unapplied text')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await download
  expect(state.exports[0].searchParams.get('search')).toBe('record 2')
  expect(state.exports[0].searchParams.get('action')).toBe('UPDATE')
  await page.getByRole('dialog', { name: 'Success', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 1–10 of 23 events')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toHaveValue('')
  expect(state.errors).toEqual([])
})

test('dates validate, and details distinguish field changes from metadata', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  const beforeDraft = state.requests.length
  await page.getByText('More filters: institution, entity ID, dates, and outcome', { exact: true }).click()
  await page.getByLabel('From (UTC)', { exact: true }).fill('2026-10-27')
  await page.getByLabel('To (UTC)', { exact: true }).fill('2026-10-01')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Start date must be on or before end date.')
  expect(state.requests).toHaveLength(beforeDraft)
  await viewEvent(page, 0).click()
  const dialog = page.getByRole('dialog', { name: 'Updated learner record 0', exact: true })
  await expect(dialog.getByRole('columnheader', { name: 'Previous value' })).toBeVisible()
  await expect(dialog.getByRole('cell', { name: 'Pending', exact: true })).toBeVisible()
  await expect(dialog.getByRole('cell', { name: 'Active', exact: true })).toBeVisible()
  await expect(dialog.getByText('QA Officer · Staff · 26 Oct 2026, 12:30:45 UTC', { exact: true })).toBeVisible()
  await dialog.getByText('Event metadata', { exact: true }).click()
  await expect(dialog.getByText(/"note": "Reviewed by HQ"/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(viewEvent(page, 0)).toBeFocused()
  expect(state.errors).toEqual([])
})

test('failed loads preserve context with retry and outdated responses cannot replace new results', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  state.fail()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load audit events')
  await expect(viewEvent(page, 0)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry events', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 1–10 of 23 events')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('slow')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('search')).toBe('slow')
  await expect(eventsSection(page).getByText('Updating… Previous results remain visible.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('record 22')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(eventsSection(page).getByText('Showing 1–1 of 1 events')).toBeVisible()
  state.releaseSlow()
  await expect(viewEvent(page, 22)).toBeVisible()
  await expect(viewEvent(page, 0)).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('signals open scoped investigations for deletes, failed authentication and mass updates', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByText('Audit signals', { exact: false }).first().click()
  const deleteSection = page.getByRole('heading', { name: 'Delete spikes', exact: true }).locator('..')
  await deleteSection.getByRole('button', { name: 'View matching events' }).click()
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('action')).toBe('DELETE')
  expect(state.requests.at(-1)?.searchParams.get('dateFrom')).toBe('2026-10-26')
  expect(state.requests.at(-1)?.searchParams.get('dateTo')).toBe('2026-10-26')
  expect(state.requests.at(-1)?.searchParams.get('institution')).toBe('QA College')
  const authSection = page.getByRole('heading', { name: 'Repeated failed authentication', exact: true }).locator('..')
  await authSection.getByRole('button', { name: 'View matching events' }).click()
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('outcome')).toBe('FAILED')
  expect(state.requests.at(-1)?.searchParams.get('actorId')).toBe('507f1f77bcf86cd799439011')
  expect(state.requests.at(-1)?.searchParams.get('action')).toBe('AUTH')
  const massSection = page.getByRole('heading', { name: 'Mass update signals', exact: true }).locator('..')
  await massSection.getByRole('button', { name: 'View matching events' }).click()
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('action')).toBe('UPDATES')
  expect(state.errors).toEqual([])
})

test('mobile cards and details work without page overflow or accessibility violations', async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await expect(eventsSection(page).getByRole('article')).toHaveCount(10)
  await page.screenshot({ path: test.info().outputPath('audit-log-mobile.png'), fullPage: true })
  await expect(viewEvent(page, 0)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const accessibility = await new AxeBuilder({ page }).include('[data-help-id="activity-log-filters"]').include('[data-help-id="activity-log-recent-events"]').analyze()
  expect(accessibility.violations).toEqual([])
  await viewEvent(page, 0).click()
  await expect(page.getByRole('dialog', { name: 'Updated learner record 0', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(state.errors).toEqual([])
})
