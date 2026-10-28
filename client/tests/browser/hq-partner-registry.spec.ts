import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import releases from '../../src/data/releases.json' with { type: 'json' }

async function setup(page: Page, role = 'SuperAdmin') {
  const partners = Array.from({ length: 21 }, (_, index) => ({
    _id: `partner-${index}`, name: `Partner ${String(21 - index).padStart(2, '0')}`, sector: index % 2 ? 'Construction' : 'Automotive',
    region: index === 5 ? 'Greater Accra' : 'Ashanti', district: index ? 'District' : '', status: index === 2 ? 'Inactive' : 'Active',
    partnerType: index === 4 ? 'Government' : 'RegisteredCompany', operatingModel: 'FixedSite', totalSlots: 20, usedSlots: 6,
    approvalStatus: index ? 'Approved' : 'PendingHQApproval', approvalVersion: 3,
    programs: index ? ['Automotive'] : [], mouDocumentUrl: index ? '/api/documents/mou/file' : '',
    contactEmail: `partner${index}@example.test`, contactPerson: 'Ama Mensah', locationVerificationStatus: index ? 'TownSelected' : 'PendingGPS',
    portalAccount: { state: index === 2 ? 'Active' : 'NotCreated', count: index === 2 ? 1 : 0 },
    addedBy: { name: 'QA Manager', role: 'Manager', institution: 'QA College' },
    createdAt: '2026-10-26T10:00:00Z',
  }))
  const requests: URL[] = [], exports: URL[] = [], writes: string[] = [], errors: string[] = []
  let failList = false, failDetails = false
  let releaseAccount: (() => void) | undefined, releaseSlow: (() => void) | undefined, finishSlow: (() => void) | undefined
  let slowDetails = false
  const accountGate = new Promise<void>(resolve => { releaseAccount = resolve })
  const detailsGate = new Promise<void>(resolve => { releaseSlow = resolve })
  const detailsDone = new Promise<void>(resolve => { finishSlow = resolve })
  await page.setViewportSize({ width: 1440, height: 1000 })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa-registry', 'seen')
    localStorage.setItem('gtvets-release-read:v1:qa-registry', latest)
  }, releases[0].id)
  const details = (index: number) => ({ partner: partners[index], dependencies: {}, auditHistory: [], deletion: { allowed: false, blockers: [{ key: 'placements', label: 'placements', count: 1 }] } })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'qa-registry', name: 'QA HQ', role, status: 'Active', hqScopeType: 'National' } })
    if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa-csrf' } })
    if (url.pathname === '/api/industry-partners') {
      const p = url.searchParams
      if (!p.has('page')) exports.push(url)
      else requests.push(url)
      if (failList && p.has('page')) { failList = false; return route.fulfill({ status: 500, json: { message: 'Unavailable' } }) }
      const query = (p.get('q') || '').toLowerCase()
      const filtered = partners.filter(partner => (!query || [partner.name, partner.contactEmail, partner.sector].some(value => value.toLowerCase().includes(query))) && ['region', 'sector', 'partnerType', 'approvalStatus'].every(key => !p.get(key) || partner[key as 'region' | 'sector' | 'partnerType' | 'approvalStatus'] === p.get(key)) && (!p.get('partnerStatus') || partner.status === p.get('partnerStatus')) && (p.get('attention') !== 'missingPrograms' || !partner.programs.length))
      if (p.get('sort')?.startsWith('name')) filtered.sort((a, b) => a.name.localeCompare(b.name) * (p.get('sort') === 'name-desc' ? -1 : 1))
      if (!p.has('page')) return route.fulfill({ json: filtered })
      const current = Number(p.get('page') || 1)
      return route.fulfill({ json: { items: filtered.slice((current - 1) * 18, current * 18), total: filtered.length, totalPages: Math.ceil(filtered.length / 18), sectors: ['Automotive', 'Construction'], summary: { total: 21, approved: 20, pending: 1, rejected: 0 } } })
    }
    if (url.pathname === '/api/hq/partner-insights') return route.fulfill({ json: {
      scope: 'National', generatedAt: '2026-10-28T12:00:00Z', summary: { total: 21, pendingApproval: 1, missingPrograms: 1, missingEmail: 0, missingMou: 1, missingDistrict: 1 }, regions: [], sectors: [], placements: [], requests: [],
    } })
    if (url.pathname === '/api/industry-partners/partner-1/create-account') {
      writes.push('create-account'); await accountGate
      partners[1].portalAccount = { state: 'SetupPending', count: 1 }
      return route.fulfill({ json: { message: 'Created' } })
    }
    const detailMatch = url.pathname.match(/^\/api\/industry-partners\/partner-(\d+)$/)
    if (detailMatch) {
      const index = Number(detailMatch[1])
      if (failDetails) { failDetails = false; return route.fulfill({ status: 500, json: { message: 'Unavailable' } }) }
      if (slowDetails && index === 0) { await detailsGate; await route.fulfill({ json: details(index) }).catch(() => {}); finishSlow?.(); return }
      return route.fulfill({ json: details(index) })
    }
    if (url.pathname === '/api/partner-change-requests' || url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  return { requests, exports, writes, errors, failList: () => { failList = true }, failDetails: () => { failDetails = true }, slowDetails: () => { slowDetails = true }, releaseSlow: async () => { releaseSlow?.(); await detailsDone }, releaseAccount: () => releaseAccount?.() }
}
const registry = (page: Page) => page.getByRole('region', { name: 'Partner registry', exact: true })
const partnerRow = (page: Page, name: string) => registry(page).getByRole('row').filter({ has: page.getByRole('button', { name, exact: true }) })
async function select(page: Page, label: string, value: string) {
  if (!await page.getByRole('combobox', { name: label, exact: true }).isVisible()) await page.getByText('More filters: sector, type, operational status, and attention', { exact: true }).click()
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: value, exact: true }).click()
}
async function ready(page: Page, path = '/hq-industry-partners') {
  await page.goto(path)
  await expect(registry(page).getByText(/Showing .* of 21 partners/)).toBeVisible()
}

test('registry is primary and URL filters, global sorting and pages survive browser navigation', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await expect(page.getByRole('heading', { name: 'Partner & industry insights', exact: true })).toBeHidden()
  await select(page, 'Sort partners', 'Name A–Z')
  await expect(partnerRow(page, 'Partner 01')).toBeVisible()
  await registry(page).getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(partnerRow(page, 'Partner 19')).toBeVisible()
  await expect(partnerRow(page, 'Partner 01')).toHaveCount(0)
  await select(page, 'Approval', 'Pending HQ')
  await expect(registry(page).getByText('Showing 1-1 of 1 partners')).toBeVisible()
  await expect(page).not.toHaveURL(/page=2/)
  await page.goBack()
  await expect(partnerRow(page, 'Partner 19')).toBeVisible()
  await expect(registry(page).getByText('Page 2 of 2')).toBeVisible()
  expect(state.requests.at(-1)?.searchParams.get('sort')).toBe('name-asc')
  await select(page, 'Region', 'Greater Accra')
  await expect(partnerRow(page, 'Partner 16')).toBeVisible()
  await expect(registry(page).getByText('Showing 1-1 of 1 partners')).toBeVisible()
  await page.getByRole('button', { name: 'Remove Region filter', exact: true }).click()
  await expect(registry(page).getByText('Showing 1-18 of 21 partners')).toBeVisible()
  expect(state.errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('partner-registry-desktop.png'), fullPage: true })
})

test('all-page exports retain structured filters and ordering', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await select(page, 'Partner type', 'Government')
  await select(page, 'Operational status', 'Active')
  await select(page, 'Sort partners', 'Name Z–A')
  await expect(registry(page).getByText('Showing 1-1 of 1 partners')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await download
  expect(state.exports[0].searchParams.get('partnerType')).toBe('Government')
  expect(state.exports[0].searchParams.get('partnerStatus')).toBe('Active')
  expect(state.exports[0].searchParams.get('sort')).toBe('name-desc')
  expect(state.exports[0].searchParams.has('page')).toBe(false)
  expect(state.errors).toEqual([])
})

test('insight cards keep their design and attention counts open matching scoped records', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByRole('tab', { name: 'Partner & industry insights', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Partner & industry insights', exact: true })).toBeVisible()
  await expect(page.getByText('Registered partners', { exact: true })).toBeVisible()
  await expect(page.getByText(/Reserved slots are managed through approved, date-bound allocations/)).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('partner-insights-preserved.png'), fullPage: true })
  await page.getByRole('button', { name: 'View partners: Programme eligibility missing', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Partner Registry', exact: true })).toHaveAttribute('data-state', 'active')
  await expect(registry(page).getByText('Showing 1-1 of 1 partners')).toBeVisible()
  expect(state.requests.at(-1)?.searchParams.get('attention')).toBe('missingPrograms')
  expect(state.errors).toEqual([])
})

test('failed registry and detail loads keep context and offer retries with focus restoration', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  state.failList()
  await page.getByRole('button', { name: 'Refresh registry', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load partners')
  await expect(partnerRow(page, 'Partner 21')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry registry', exact: true }).click()
  await expect(registry(page).getByText('Showing 1-18 of 21 partners')).toBeVisible()
  state.failDetails()
  const name = partnerRow(page, 'Partner 21').getByRole('button', { name: 'Partner 21', exact: true })
  await name.click()
  await expect(page.getByRole('dialog', { name: 'Partner 21', exact: true }).getByRole('alert')).toContainText('Unable to load this partner record')
  await page.getByRole('button', { name: 'Retry details', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Placement review', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Coordinates not recorded', { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(name).toBeFocused()
  expect(state.errors).toEqual([])
})

test('closing a slow detail request cannot replace a subsequently selected partner', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  state.slowDetails()
  await partnerRow(page, 'Partner 21').getByRole('button', { name: 'Partner 21', exact: true }).click()
  await expect(page.getByText('Loading complete partner record…', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await partnerRow(page, 'Partner 20').getByRole('button', { name: 'Partner 20', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Partner 20', exact: true }).getByRole('region', { name: 'Placement review', exact: true })).toBeVisible()
  await state.releaseSlow()
  await expect(page.getByRole('dialog', { name: 'Partner 20', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Partner 21', exact: true })).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('portal creation has a single pending operation and exposes the resulting setup state', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  const row = partnerRow(page, 'Partner 20')
  await row.getByRole('button', { name: 'Actions for Partner 20', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Create coordinator account', exact: true }).click()
  await expect(row.getByText('Creating coordinator account…', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Actions for Partner 20', exact: true })).toBeDisabled()
  expect(state.writes).toEqual(['create-account'])
  state.releaseAccount()
  await page.getByRole('dialog', { name: 'Success', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(row.getByText('Coordinator setup pending', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Actions for Partner 20', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Create coordinator account', exact: true })).toBeDisabled()
  expect(state.errors).toEqual([])
})

test('mobile registry has usable names, labels, selected states and no page overflow', async ({ page }) => {
  const state = await setup(page, 'HQStaff')
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await expect(registry(page).getByRole('article')).toHaveCount(18)
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="Partner registry"]').analyze()
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Partner 21', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Partner 21', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Permanently delete', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('partner-details-mobile.png') })
  expect(state.errors).toEqual([])
})
