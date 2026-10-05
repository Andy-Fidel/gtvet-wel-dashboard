import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

const learners = [
  { _id: '507f1f77bcf86cd799439011', name: 'Ama Mensah', firstName: 'Ama', lastName: 'Mensah', trackingId: 'WEL-A', indexNumber: 'A', institution: 'QA', program: 'Electrical', year: 'Year 1', status: 'Pending' },
  { _id: '507f1f77bcf86cd799439012', name: 'Kofi Owusu', firstName: 'Kofi', lastName: 'Owusu', trackingId: 'WEL-B', indexNumber: 'B', institution: 'QA', program: 'Electrical', year: 'Year 1', status: 'Placed' },
  { _id: '507f1f77bcf86cd799439013', name: 'Akua Boateng', firstName: 'Akua', lastName: 'Boateng', trackingId: 'WEL-C', indexNumber: 'C', institution: 'QA', program: 'Electrical', year: 'Year 2', status: 'Pending' },
]

async function setup(page: Page, role = 'Admin', fail = false) {
  const writes: string[][] = [], errors: string[] = []
  let deleted = false
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:bulk-qa', 'seen')
    localStorage.setItem('gtvets-release-read:v1:bulk-qa', latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'bulk-qa', role, name: 'QA Admin', email: 'qa@example.test', institution: 'QA', region: 'Ashanti', status: 'Active' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path === '/api/learners/bulk-delete') {
      writes.push(route.request().postDataJSON().learnerIds)
      if (fail) return route.abort('failed')
      deleted = true
      return route.fulfill({ json: { deletedCount: 1, deletedIds: [learners[0]._id], skipped: [{ id: learners[1]._id, name: learners[1].name, reason: 'Linked placement records must be retained.' }] } })
    }
    if (path === '/api/learners') {
      const currentPage = Number(url.searchParams.get('page') || 1)
      const items = currentPage === 2 ? [learners[2]] : (deleted ? [learners[1]] : learners.slice(0, 2))
      return route.fulfill({ json: { items, page: currentPage, total: deleted ? 2 : 3, totalPages: 2, pageSize: 25, summary: { year1: 2, year2: 1, year3: 0, graduated: 0 }, programOptions: ['Electrical'], availableIntakeYears: [], institutionOptions: ['QA'] } })
    }
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (path === '/api/institutions') return route.fulfill({ json: [{ name: 'QA', region: 'Ashanti', programs: ['Electrical'] }] })
    if (path === '/api/my-institution') return route.fulfill({ json: { name: 'QA', programs: ['Electrical'] } })
    if (path === '/api/idms/status') return route.fulfill({ json: { enabled: false, institutionEnabled: false } })
    return route.fulfill({ json: [] })
  })
  return { writes, errors }
}

test('select, cancel, confirm and review a partial bulk deletion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { writes, errors } = await setup(page)
  await page.goto('/learners')
  await expect(page.getByRole('button', { name: 'Delete selected (0)', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select Ama Mensah', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Select Kofi Owusu', exact: true }).check()
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete 2 selected learners?' })
  await expect(confirmation.getByText('Ama Mensah · WEL-A')).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Delete selected learners', exact: true }).click()
  const result = page.getByRole('dialog', { name: 'Bulk deletion results' })
  await expect(result.getByText('1 learner(s) deleted. 1 kept.')).toBeVisible()
  await expect(result.getByText('Kofi Owusu', { exact: true })).toBeVisible()
  await expect(result.getByText('Linked placement records must be retained.')).toBeVisible()
  expect(writes).toEqual([[learners[0]._id, learners[1]._id]])
  await result.getByRole('button', { name: 'Close results' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select Ama Mensah', exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Select Kofi Owusu', exact: true })).not.toBeChecked()
  expect(errors).toEqual([])
})

test('mobile selection stays on the current page and clears after paging', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { errors } = await setup(page)
  await page.goto('/learners')
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check()
  await expect(page.getByRole('button', { name: 'Delete selected (2)', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete selected (0)', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Select Akua Boateng', exact: true })).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Delete selected (0)', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('failed network requests do not queue destructive work or report success', async ({ page }) => {
  await setup(page, 'Admin', true)
  await page.goto('/learners')
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check()
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click()
  await page.getByRole('dialog', { name: 'Delete 2 selected learners?' }).getByRole('button', { name: 'Delete selected learners', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Unable to complete action' })).toContainText('Bulk deletion requires an online connection')
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => (localStorage.getItem(key) || '').includes('/api/learners/bulk-delete')))).toBe(false)
  await expect(page.getByRole('dialog', { name: 'Bulk deletion results' })).toHaveCount(0)
})

test('SuperAdmin sees the header action and can submit selected learners for deletion', async ({ page }) => {
  const { writes } = await setup(page, 'SuperAdmin')
  await page.goto('/learners')
  const button = page.getByRole('button', { name: 'Delete selected (0)', exact: true })
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check()
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click()
  await page.getByRole('dialog', { name: 'Delete 2 selected learners?' }).getByRole('button', { name: 'Delete selected learners', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Bulk deletion results' })).toBeVisible()
  expect(writes).toEqual([[learners[0]._id, learners[1]._id]])
})

for (const role of ['HQStaff', 'RegionalAdmin']) {
  test(`${role} retains read-only learner registry access`, async ({ page }) => {
    await setup(page, role)
    await page.goto('/learners?view=records')
    await expect(page.getByRole('row').filter({ hasText: 'Ama Mensah' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Select current page', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Delete selected/ })).toHaveCount(0)
  })
}
