import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import releases from '../../src/data/releases.json'

const latest = releases[0].id
const key = (userId: string) => `gtvets-release-read:v1:${userId}`

async function setup(page: Page, role = 'Admin', userId = 'release-qa') {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(id => {
    localStorage.setItem(`gtvets-help-auto-started:v1:${id}`, 'seen')
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, userId)
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: userId, role, name: 'Release reader', email: 'reader@example.test', institution: 'QA', region: 'Ashanti', status: 'Active', hqScopeType: 'National' } })
    if (path === '/api/industry-partners') return route.fulfill({ json: { items: [], total: 0, totalPages: 0 } })
    if (path === '/api/partner-change-requests' || path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  return errors
}

test('users can read relevant notes, explore all updates, search and mark a release read', async ({ page }, testInfo) => {
  const errors = await setup(page)
  await page.goto('/whats-new')
  await expect(page.getByRole('heading', { name: 'What’s new', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Correct a rejected partner submission' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Explain why a submission was rejected' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('desktop-release-notes.png'), fullPage: true })
  await page.getByRole('button', { name: 'All updates', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Explain why a submission was rejected' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Partner Registry' })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search updates' }).fill('nothing-matches-this')
  await expect(page.getByRole('heading', { name: 'No matching updates' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all updates' }).click()
  await expect(page.getByRole('heading', { name: 'A home for portal updates' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark latest update as read' }).click()
  await expect(page.getByRole('button', { name: 'You’re up to date' })).toBeDisabled()
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key('release-qa'))).toBe(latest)
  await page.reload()
  await expect(page.getByRole('button', { name: 'You’re up to date' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('release announcements persist after dismissal, reappear for new releases and stay account scoped', async ({ page }) => {
  await setup(page)
  await page.goto('/industry-partners')
  const notice = page.getByRole('complementary', { name: 'New portal updates' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Dismiss release announcement' }).click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Industry Partners', exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.evaluate(storageKey => localStorage.setItem(storageKey, '2026-10-02-partner-approvals'), key('release-qa'))
  await page.reload()
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Dismiss release announcement' }).click()
  await setup(page, 'Admin', 'another-reader')
  await page.reload()
  await expect(notice).toBeVisible()
})

test('reading a release in another tab dismisses its announcement', async ({ page, context }) => {
  await setup(page)
  await page.goto('/industry-partners')
  await expect(page.getByRole('complementary', { name: 'New portal updates' })).toBeVisible()
  const other = await context.newPage()
  await setup(other)
  await other.goto('/whats-new')
  await other.getByRole('button', { name: 'Mark latest update as read' }).click()
  await expect(page.getByRole('complementary', { name: 'New portal updates' })).toHaveCount(0)
})

for (const role of ['HQStaff', 'RegionalAdmin', 'IndustryPartner', 'Guardian']) {
  test(`${role} can open the release history`, async ({ page }) => {
    await setup(page, role)
    await page.goto('/whats-new')
    await expect(page.getByRole('heading', { name: 'What’s new', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'A home for portal updates' })).toBeVisible()
    if (role === 'Guardian' || role === 'IndustryPartner') await expect(page.getByRole('heading', { name: 'Correct a rejected partner submission' })).toHaveCount(0)
  })
}

test('mobile notes fit the viewport and meet accessibility checks', async ({ page }, testInfo) => {
  await setup(page, 'Guardian')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/whats-new')
  await expect(page.getByRole('heading', { name: 'What’s new', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page }).include('main').analyze()
  expect(result.violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('mobile-release-notes.png'), fullPage: true })
})

test('storage restrictions do not prevent dismissal for the current session', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) { if (key.startsWith('gtvets-release-read:')) throw new Error('Storage disabled'); return get.call(this, key) }
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('gtvets-release-read:')) throw new Error('Storage disabled'); set.call(this, key, value) }
  })
  await page.goto('/industry-partners')
  await page.getByRole('button', { name: 'Dismiss release announcement' }).click()
  await expect(page.getByRole('complementary', { name: 'New portal updates' })).toHaveCount(0)
})
