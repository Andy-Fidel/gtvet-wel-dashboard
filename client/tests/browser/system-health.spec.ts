import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function report() {
  return { checkedAt: new Date().toISOString(), status: 'warning', deployment: { version: '1.0.0', commit: 'a'.repeat(40), builtAt: new Date().toISOString(), runtime: 'v22.0.0', environment: 'production' }, checks: [
    ...['API', 'Database', 'Mongoose', 'Queue', 'Storage', 'Push notifications', 'Email', 'Backups', 'App version'].map((label, index) => ({ id: `service-${index}`, label, description: 'Service readiness', status: label === 'Queue' ? 'warning' : 'healthy', summary: label === 'Queue' ? 'No successful worker run within the last five minutes.' : 'Service check passed.', durationMs: 20, details: [{ label: 'Verification', value: 'Live check' }], action: label === 'Queue' ? 'Ask your administrator to check the notification worker.' : null })),
    { id: 'prisma', label: 'Prisma', description: 'Database tooling', status: 'not_used', summary: 'This application uses MongoDB with Mongoose. Prisma is not installed.', durationMs: 0, details: [], action: null },
  ] }
}

async function setup(page: Page, role = 'SuperAdmin') {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('gtvets-help-auto-started:v1:health-qa', 'seen')
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'health-qa', role, name: 'HQ operator', email: 'operator@example.test', institution: 'QA', region: 'Ashanti', status: 'Active', hqScopeType: 'National' } })
    if (path === '/api/system-health') return route.fulfill({ json: report() })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  return errors
}

for (const role of ['SuperAdmin', 'HQManager', 'HQStaff']) test(`${role} can read HQ health checks and refresh diagnostics`, async ({ page }, info) => {
  const errors = await setup(page, role)
  await page.goto('/system-health')
  await expect(page.getByRole('heading', { name: 'System health', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prisma', exact: true })).toBeVisible()
  await expect(page.getByText('This application uses MongoDB with Mongoose. Prisma is not installed.')).toBeVisible()
  await expect(page.getByText('No successful worker run within the last five minutes.')).toBeVisible()
  await page.getByRole('button', { name: 'Run diagnostics', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Run diagnostics', exact: true })).toBeEnabled()
  await page.screenshot({ path: info.outputPath(`${role}-health-desktop.png`), fullPage: true })
  expect(errors).toEqual([])
})

test('failed refresh and offline mode clearly mark existing results as last known', async ({ page }) => {
  await setup(page)
  await page.goto('/system-health')
  await expect(page.getByRole('heading', { name: 'API', exact: true })).toBeVisible()
  await page.route('**/api/system-health', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }))
  await page.getByRole('button', { name: 'Run diagnostics', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Live health could not be confirmed' })).toBeVisible()
  await expect(page.getByText('Awaiting live confirmation')).toBeVisible()
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')) })
  await expect(page.getByText('You’re offline.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run diagnostics', exact: true })).toBeDisabled()
})

test('institution users cannot open system health', async ({ page }) => {
  await setup(page, 'Admin')
  await page.goto('/system-health')
  await expect(page).not.toHaveURL(/\/system-health$/)
  await expect(page.getByRole('link', { name: 'System Health', exact: true })).toHaveCount(0)
})

test('mobile health checks fit the viewport and meet accessibility checks', async ({ page }, info) => {
  await setup(page, 'HQStaff')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/system-health')
  await expect(page.getByRole('heading', { name: 'Prisma', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page }).include('main').analyze()
  expect(result.violations).toEqual([])
  await page.screenshot({ path: info.outputPath('health-mobile.png'), fullPage: true })
})


test('backup failures show safe check details in the HQ page and downloaded report', async ({ page }) => {
  await setup(page, 'HQStaff')
  const diagnostics = report()
  const backup = diagnostics.checks.find(check => check.label === 'Backups')!
  Object.assign(backup, { status: 'warning', summary: 'Recent healthy backup checks could not be confirmed.',
    details: [
      { label: 'Backup diagnostic code', value: 'MONITOR_FAILED' },
      { label: 'Recently verified external backup', value: 'Failed' },
      { label: 'Backup filesystem capacity', value: 'Passed' },
      { label: 'Application health', value: 'Passed' },
    ], action: 'Ask your server administrator to review the failed backup check and recovery monitor logs.' })
  await page.route('**/api/system-health', route => route.fulfill({ json: diagnostics }))
  await page.goto('/system-health')
  const card = page.locator('[aria-labelledby="health-service-7"]')
  await expect(card.getByText('Needs attention', { exact: true })).toBeVisible()
  await expect(card.getByText('MONITOR_FAILED', { exact: true })).toBeVisible()
  await expect(card.locator('dl > div').filter({ hasText: 'Recently verified external backup' })).toHaveText('Recently verified external backupFailed')
  await expect(card.locator('dl > div').filter({ hasText: 'Backup filesystem capacity' })).toHaveText('Backup filesystem capacityPassed')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download report' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream!) chunks.push(chunk)
  const saved = JSON.parse(Buffer.concat(chunks).toString())
  expect(saved.checks.find((check: { label: string }) => check.label === 'Backups').details).toEqual(backup.details)
})
