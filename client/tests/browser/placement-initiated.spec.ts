import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

const learnerId = '507f1f77bcf86cd799439011'
const batchId = '507f1f77bcf86cd799439012'
const learner = { _id: learnerId, name: 'Ama Mensah', firstName: 'Ama', lastName: 'Mensah', program: 'Electrical', year: 'Year 1', trackingId: 'WEL-001', institution: 'QA Institute', status: 'Placed' }
const placement = { _id: '507f1f77bcf86cd799439013', learner, companyName: 'QA Engineering', status: 'Active', createdAt: '2026-10-31T14:35:00.000Z', startDate: '2026-11-05', endDate: '2026-12-05', location: 'Accra', supervisorName: 'QA Supervisor' }

async function setup(page: Page, role: string, date: string | null = placement.createdAt, activated = true) {
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:initiation-qa', 'seen')
    localStorage.setItem('gtvets-release-read:v1:initiation-qa', latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, releases[0].id)
  const current = { ...placement, createdAt: date }
  const batch = { _id: batchId, institution: 'QA Institute', status: activated ? 'Converted' : 'Submitted', sourceType: 'InstitutionFound', program: 'Electrical', requestedSlots: 1, learners: [learner], convertedPlacementIds: activated ? [current] : [], createdAt: '2026-10-20T08:00:00Z', startDate: placement.startDate, endDate: placement.endDate }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'initiation-qa', name: 'QA User', role, institution: 'QA Institute', hqScopeType: 'National', status: 'Active' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path.endsWith('/profile')) return route.fulfill({ json: { learner, placements: [current], placementHistory: [{ ...current, placementId: current._id, cycleNumber: 1 }], visits: [], assessments: [], evaluations: [], semesterReports: [] } })
    if (path.endsWith('/progress')) return route.fulfill({ json: { progress: null } })
    if (path === '/api/placements') return route.fulfill({ json: { items: [current], total: 1, totalPages: 1, page: 1 } })
    if (path === '/api/placement-requests') return route.fulfill({ json: [batch] })
    if (path === `/api/placement-requests/${batchId}`) return route.fulfill({ json: batch })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (path === '/api/placement-transfers') return route.fulfill({ json: { items: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
}

for (const role of ['HQManager', 'HQStaff', 'SuperAdmin', 'Admin', 'Staff']) {
  test(`${role} sees initiation separately from work dates on profile and timeline`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: role === 'HQStaff' ? 390 : 1440, height: 900 })
    await setup(page, role)
    await page.goto(`/learners/${learnerId}`)
    const dates = page.getByRole('region', { name: 'Active placement dates' })
    await expect(dates.locator('time')).toHaveText('31 Oct 2026, 14:35 UTC')
    await expect(dates.locator('time')).toHaveAttribute('datetime', placement.createdAt)
    await expect(dates.getByText('Start date', { exact: true })).toBeVisible()
    await expect(dates.getByText('Nov 5, 2026', { exact: true })).toBeVisible()
    if (role === 'HQStaff') await dates.screenshot({ path: testInfo.outputPath('placement-dates-mobile.png') })
    await page.getByRole('tab', { name: 'Timeline', exact: true }).click()
    const timeline = page.getByRole('region', { name: 'Placement initiation timeline' })
    await expect(timeline.getByText('QA Engineering', { exact: true })).toBeVisible()
    await expect(timeline.locator('time')).toHaveText('31 Oct 2026, 14:35 UTC')
  })
}

for (const date of [null, 'invalid-date']) {
  test(`missing or invalid creation timestamp ${date} does not invent an initiation date`, async ({ page }) => {
    await setup(page, 'HQStaff', date)
    await page.goto(`/learners/${learnerId}`)
    const dates = page.getByRole('region', { name: 'Active placement dates' })
    await expect(dates.getByText('Not recorded', { exact: true })).toBeVisible()
    await expect(dates.locator('time')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Timeline', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Placement initiation timeline' }).getByText('Not recorded')).toBeVisible()
  })
}

test('placement batch details show actual placement initiation, distinct from batch submission', async ({ page }) => {
  await setup(page, 'Staff')
  await page.goto('/placements')
  await page.getByRole('tab', { name: 'Placement Batches / History' }).click()
  await page.getByRole('button', { name: 'View Learner Placement Details' }).click()
  const dialog = page.getByRole('dialog', { name: 'Placement Batch Details' })
  await expect(dialog.locator('time')).toHaveText('31 Oct 2026, 14:35 UTC')
  await expect(dialog.getByText('Placement initiated', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/^(20 Oct 2026|Oct 20, 2026)$/)).toBeVisible()
})

test('planned batch does not use request submission time as placement initiation', async ({ page }) => {
  await setup(page, 'Staff', null, false)
  await page.goto('/placements')
  await page.getByRole('tab', { name: 'Placement Batches / History' }).click()
  await page.getByRole('button', { name: 'View Learner Placement Details' }).click()
  const dialog = page.getByRole('dialog', { name: 'Placement Batch Details' })
  await expect(dialog.getByText('Not initiated', { exact: true })).toBeVisible()
  await expect(dialog.locator('time')).toHaveCount(0)
})

test('HQ users can see initiation in the placements register', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, 'HQStaff')
  await page.goto('/placements')
  await expect(page.getByRole('columnheader', { name: 'Placement initiated' })).toBeVisible()
  await expect(page.locator('time').filter({ visible: true })).toHaveText('31 Oct 2026, 14:35 UTC')
})
