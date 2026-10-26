import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import releases from '../../src/data/releases.json' with { type: 'json' }

const actor = { _id: 'qa-directory-hq', name: 'QA HQ', email: 'hq@example.test', role: 'SuperAdmin', status: 'Active' }
async function setup(page: Page, formulaName = false) {
  const users = Array.from({ length: 25 }, (_, index) => ({
    _id: `directory-${index}`, name: index === 0 && formulaName ? '=2+2' : `Person ${String(25 - index).padStart(2, '0')}`,
    email: `person${index}@example.test`, role: index === 0 ? 'SuperAdmin' : 'Staff', status: index === 8 ? 'Inactive' : 'Active',
    institution: index === 13 ? 'Other College' : 'QA College', region: index === 13 ? 'Greater Accra' : 'Ashanti',
    passwordChangeRequired: index === 0, lastLoginAt: index === 1 ? '2026-10-26T12:00:00Z' : undefined,
    lifecycleStatus: { code: index === 0 ? 'PasswordChangeRequired' : 'Active', label: index === 0 ? 'Password Change Required' : 'Active' },
    auditSummary: { failedLoginCount: 0, recentSensitiveActions: [] },
  }))
  const requests: URL[] = [], writes: string[] = [], errors: string[] = []
  let failNext = false, overviewRequests = 0
  let releaseMutation: (() => void) | undefined
  const mutationGate = new Promise<void>(resolve => { releaseMutation = resolve })
  await page.setViewportSize({ width: 1440, height: 1000 })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa-directory-hq', 'seen')
    localStorage.setItem('gtvets-release-read:v1:qa-directory-hq', latest)
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: actor })
    if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa-csrf' } })
    if (url.pathname === '/api/users/registry') {
      requests.push(url)
      if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { message: 'Unavailable' } }) }
      const params = url.searchParams
      const query = (params.get('q') || '').toLowerCase()
      const filtered = users.filter(user => (!query || [user.name, user.email, user.institution, user.region].some(value => value.toLowerCase().includes(query))) && ['role', 'status', 'institution', 'region'].every(key => !params.get(key) || user[key as 'role' | 'status' | 'institution' | 'region'] === params.get(key)))
      if (params.get('sortBy') === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name) * (params.get('sortDirection') === 'desc' ? -1 : 1))
      const current = Number(params.get('page') || 1)
      return route.fulfill({ json: { items: filtered.slice((current - 1) * 12, current * 12), total: filtered.length, totalPages: Math.ceil(filtered.length / 12), page: current } })
    }
    if (url.pathname === '/api/users/governance/overview') {
      overviewRequests++
      return route.fulfill({ json: { totalUsers: users.length, roleCounts: { Staff: 24, SuperAdmin: 1 }, regionStats: [], riskyAccounts: { items: [], total: users.filter(user => user.status === 'Inactive').length, page: 1, totalPages: 1 }, dormantPrivilegedAccounts: { items: [], total: 0, page: 1, totalPages: 0 } } })
    }
    if (url.pathname === '/api/users/directory-0' && route.request().method() === 'PUT') {
      writes.push('status')
      await mutationGate
      users[0].status = JSON.parse(route.request().postData() || '{}').status
      return route.fulfill({ json: users[0] })
    }
    if (url.pathname === '/api/users/directory-0' && route.request().method() === 'DELETE') { writes.push('delete'); return route.fulfill({ json: { message: 'Deleted' } }) }
    if (url.pathname === '/api/access-approvals') return route.fulfill({ json: [] })
    if (url.pathname === '/api/institutions') return route.fulfill({ json: [{ name: 'QA College', region: 'Ashanti' }, { name: 'Other College', region: 'Greater Accra' }] })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  return { requests, writes, errors, fail: () => { failNext = true }, overviewRequests: () => overviewRequests, releaseMutation: () => releaseMutation?.() }
}
const directory = (page: Page) => page.getByRole('region', { name: 'User directory', exact: true })
const row = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByRole('button', { name, exact: true }) })
async function ready(page: Page) {
  await page.goto('/users')
  await expect(directory(page).getByText('Showing 1-12 of 25 users', { exact: true })).toBeVisible()
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('directory is primary, sorting spans pages, and filters are removable', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.screenshot({ path: test.info().outputPath('user-directory-desktop.png'), fullPage: true })
  await expect(page.getByRole('heading', { name: 'Role Governance Dashboard', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(directory(page).getByText('Page 2 of 3')).toBeVisible()
  await select(page, 'Sort users', 'Name A–Z')
  await expect(row(page, 'Person 01')).toBeVisible()
  await expect(directory(page).getByText('Page 1 of 3')).toBeVisible()
  expect(state.requests.at(-1)?.searchParams.get('sortBy')).toBe('name')
  expect(state.requests.at(-1)?.searchParams.get('sortDirection')).toBe('asc')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(row(page, 'Person 13')).toBeVisible()
  await expect(row(page, 'Person 01')).toHaveCount(0)
  await select(page, 'Account access', 'Suspended')
  await expect(directory(page).getByText('Showing 1-1 of 1 users')).toBeVisible()
  await expect(row(page, 'Person 17')).toBeVisible()
  await page.getByRole('button', { name: 'Remove Access: Suspended', exact: true }).click()
  await expect(directory(page).getByText('Showing 1-12 of 25 users')).toBeVisible()
  await select(page, 'Institution', 'Other College')
  await expect(row(page, 'Person 12')).toBeVisible()
  await expect(directory(page).getByText('Showing 1-1 of 1 users')).toBeVisible()
  expect(state.errors).toEqual([])
})

test('details explain platform scope, enabled access, and incomplete setup with keyboard focus restored', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await expect(row(page, 'Person 25').getByText('Platform-wide', { exact: true })).toBeVisible()
  await expect(row(page, 'Person 25').getByText('Access enabled', { exact: true })).toBeVisible()
  await expect(row(page, 'Person 25').getByText('Password setup required', { exact: true })).toBeVisible()
  const name = row(page, 'Person 25').getByRole('button', { name: 'Person 25', exact: true })
  await name.click()
  const details = page.getByRole('dialog', { name: 'Person 25', exact: true })
  await expect(details.getByText('Platform-wide', { exact: true })).toBeVisible()
  await expect(details.getByText('Password setup required', { exact: true })).toBeVisible()
  await expect(details.getByRole('heading', { name: 'Account history', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await expect(name).toBeFocused()
  expect(state.errors).toEqual([])
})

test('current-page exports include display values, produce one download, and retain chosen columns after refresh', async ({ page }) => {
  const state = await setup(page, true)
  await ready(page)
  const downloads: string[] = []
  page.on('download', download => downloads.push(download.suggestedFilename()))
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export page CSV', exact: true }).click()
  const download = await downloadEvent
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.trim().split('\n')).toHaveLength(13)
  expect(csv).toContain('User,Role,Access scope,Account state')
  expect(csv).toContain("'=2+2 <person0@example.test>")
  expect(csv).toContain('Platform-wide')
  expect(csv).toContain('Access enabled; Password setup required')
  expect(csv).not.toContain('person12@example.test')
  expect(downloads).toHaveLength(1)
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('button', { name: 'Last sign-in', exact: true }).click()
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh users', exact: true }).click()
  await expect(directory(page).getByText('Showing 1-12 of 25 users', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Last sign-in', exact: true })).toBeVisible()
  const pdfDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export page PDF', exact: true }).click()
  const pdf = await pdfDownload
  expect((await readFile((await pdf.path())!)).subarray(0, 4).toString()).toBe('%PDF')
  expect(state.errors).toEqual([])
})

test('mutations show a pending state, refresh governance totals, and errors preserve directory context', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  const overviewBefore = state.overviewRequests()
  await row(page, 'Person 25').getByRole('button', { name: 'Actions for Person 25', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Suspend access', exact: true }).click()
  await expect(row(page, 'Person 25').getByText('Updating access…')).toBeVisible()
  await expect(row(page, 'Person 25').getByRole('button', { name: 'Actions for Person 25', exact: true })).toBeDisabled()
  expect(state.writes).toEqual(['status'])
  state.releaseMutation()
  await page.getByRole('dialog', { name: 'Success', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(row(page, 'Person 25').getByText('Access suspended', { exact: true })).toBeVisible()
  await expect.poll(state.overviewRequests).toBeGreaterThan(overviewBefore)
  state.fail()
  await page.getByRole('button', { name: 'Refresh users', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load users')
  await expect(row(page, 'Person 25')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export page CSV', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry users', exact: true }).click()
  await expect(directory(page).getByText('Showing 1-12 of 25 users')).toBeVisible()
  expect(state.errors).toEqual([])
})

test('deletion identifies the account and cancellation performs no write', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await row(page, 'Person 25').getByRole('button', { name: 'Actions for Person 25', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete user', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete user account?', exact: true })
  await expect(confirmation.getByText('person0@example.test', { exact: true })).toBeVisible()
  await expect(confirmation.getByText(/Assigned work must be reassigned/)).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  expect(state.writes).toEqual([])
  await expect(row(page, 'Person 25').getByRole('button', { name: 'Actions for Person 25', exact: true })).toBeFocused()
})

test('mobile directory and details have no page overflow or accessibility violations', async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await expect(directory(page).getByRole('article')).toHaveCount(12)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="User directory"]').analyze()
  expect(accessibility.violations).toEqual([])
  await page.getByRole('button', { name: 'Person 25', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Person 25', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(state.errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('user-details-mobile.png'), fullPage: true })
})
