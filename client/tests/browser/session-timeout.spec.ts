import { expect, test, type Page } from '@playwright/test'

const MINUTE = 60000
const account = { _id: 'session-qa', name: 'Session QA', email: 'session@example.test', role: 'Admin', status: 'Active', institution: 'QA Institute', passwordChangeRequired: false }

async function setup(page: Page, { maximum = 8 * 60 * MINUTE, mfa = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-15T09:00:00Z') })
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:session-qa', 'seen'))
  let started = new Date('2026-10-15T09:00:00Z').getTime()
  let lastActivity = started
  let generation = 1
  let activityRequests = 0
  const timing = (now: number) => ({ id: `session-${generation}`, userId: account._id, expiresAt: started + maximum, idleExpiresAt: lastActivity + 30 * MINUTE, serverNow: now, warningMs: 2 * MINUTE })
  await page.context().route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const now = await page.evaluate(() => Date.now())
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { ...account, session: timing(now) } })
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'qa-csrf' } })
    if (path.endsWith('/auth/login')) {
      const body = route.request().postDataJSON()
      if (body.password !== 'correct-password') return route.fulfill({ status: 401, json: { message: 'Invalid email or password' } })
      if (mfa && !body.mfaCode) return route.fulfill({ status: 202, json: { mfaRequired: true } })
      started = now; lastActivity = now; generation++
      return route.fulfill({ json: { user: account } })
    }
    if (path.endsWith('/auth/session') || path.endsWith('/auth/session/activity')) {
      if (now >= Math.min(started + maximum, lastActivity + 30 * MINUTE)) return route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } })
      if (path.endsWith('/activity')) { activityRequests++; lastActivity = now }
      return route.fulfill({ json: timing(now) })
    }
    if (path.endsWith('/notifications')) return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } })
    if (path.endsWith('/push/public-key')) return route.fulfill({ json: { enabled: false } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible()
  return { activityCount: () => activityRequests }
}

test('idle warning can extend the session; background status polls cannot', async ({ page }) => {
  const state = await setup(page)
  await page.clock.fastForward(28 * MINUTE + 1000)
  const dialog = page.getByRole('dialog', { name: 'Your session is ending' })
  await expect(dialog).toBeVisible()
  expect(state.activityCount()).toBe(0)
  await page.screenshot({ path: '/tmp/session-warning.png' })
  await page.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(dialog).not.toBeVisible()
  expect(state.activityCount()).toBe(1)
  await page.clock.fastForward(3 * MINUTE)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('expiry locks the page and same-account sign in preserves an open unsaved form', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Edit Profile' }).click()
  const phone = page.getByPlaceholder('Add phone number')
  await phone.fill('0241234567')
  await page.clock.fastForward(30 * MINUTE + 1000)
  const dialog = page.getByRole('dialog', { name: 'Sign in to continue' })
  await expect(dialog).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/session-lock-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: '/tmp/session-lock-desktop.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in and resume' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid email or password')
  await page.getByLabel('Password', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: 'Sign in and resume' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(phone).toHaveValue('0241234567')
  await expect(page).toHaveURL(/\/profile$/)
})

test('absolute limit requires sign in and cannot be extended by activity', async ({ page }) => {
  await setup(page, { maximum: 5 * MINUTE })
  await page.clock.fastForward(3 * MINUTE + 1000)
  await expect(page.getByRole('dialog', { name: 'Your session is ending' })).toBeVisible()
  await expect(page.getByText('You are reaching the 8-hour session limit.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stay signed in' })).toHaveCount(0)
  await page.clock.fastForward(2 * MINUTE)
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible()
})

test('resume supports MFA without removing the locked screen', async ({ page }) => {
  await setup(page, { mfa: true })
  await page.clock.fastForward(30 * MINUTE + 1000)
  await page.getByLabel('Password', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: 'Sign in and resume' }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible()
  await page.getByLabel('Authenticator or recovery code').fill('123456')
  await page.getByRole('button', { name: 'Sign in and resume' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('offline deadlines still expire and sign out remains available', async ({ page }) => {
  await setup(page)
  await page.context().setOffline(true)
  await page.clock.fastForward(30 * MINUTE + 1000)
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible()
  await page.context().setOffline(false)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('real user interaction extends inactivity without relying on background reads', async ({ page }) => {
  const state = await setup(page)
  await page.clock.fastForward(25 * MINUTE)
  await page.getByRole('button', { name: 'Edit Profile' }).click()
  await expect.poll(state.activityCount).toBe(1)
  await page.clock.fastForward(6 * MINUTE)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('offline reload cannot restart the remaining inactivity window', async ({ page }) => {
  await setup(page)
  await page.clock.fastForward(20 * MINUTE)
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await page.route('**/api/auth/me', route => route.abort())
  await page.reload()
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible()
  await page.clock.fastForward(10 * MINUTE + 2000)
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible()
})


test('staying signed in updates the inactivity warning in other tabs', async ({ page }) => {
  const state = await setup(page)
  const other = await page.context().newPage()
  const ready = other.waitForResponse(response => response.url().endsWith('/api/auth/session'))
  await other.goto('/profile')
  await ready
  await expect(other.getByRole('button', { name: 'Edit Profile' })).toBeVisible()
  await page.clock.fastForward(28 * MINUTE + 1000)
  await expect(page.getByRole('dialog', { name: 'Your session is ending' })).toBeVisible()
  await expect(other.getByRole('dialog', { name: 'Your session is ending' })).toBeVisible()
  await page.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(other.getByRole('dialog')).not.toBeVisible()
  expect(state.activityCount()).toBe(1)
})
