import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const learner = {
  _id: '507f1f77bcf86cd799439011', name: 'Ama Akua Mensah', firstName: 'Ama', lastName: 'Mensah',
  trackingId: 'WEL-2026-001', program: 'Electrical Engineering', year: 'Year 2',
  institution: 'Accra Technical Institute', status: 'Placed', academicStatus: 'Active',
}
const placement = { _id: '507f1f77bcf86cd799439012', learner, companyName: 'Ghana Engineering Services', status: 'Active' }
const assessment = {
  _id: '507f1f77bcf86cd799439013', learner, institution: learner.institution,
  trackingId: learner.trackingId, assessmentDate: '2026-09-29', assessmentType: 'Practical',
  professionalism: 4, problemSolving: 4, overallScore: 75, assessorName: 'Kwame Addo',
}
const visit = {
  _id: '507f1f77bcf86cd799439015', learner: { ...learner, placement }, institution: learner.institution,
  visitDate: '2026-09-29', visitType: 'Physical', attendanceStatus: 'Present', performanceRating: 4,
  keyObservations: 'Progressing well', locationVerified: 'No GPS',
}
const paged = (items: unknown[]) => ({ items, total: items.length, page: 1, totalPages: 1, pageSize: 25 })

async function mockPortal(page: Page, role: 'Admin' | 'IndustryPartner') {
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:qa-mobile', 'seen'))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path.endsWith('/auth/me')) data = { _id: 'qa-mobile', name: 'Akosua Boateng', email: 'qa@example.test', role, institution: learner.institution, partnerId: { _id: 'partner-qa', name: placement.companyName } }
    else if (path.endsWith('/auth/csrf')) data = { csrfToken: 'qa' }
    else if (path.endsWith('/notifications')) data = { items: [], unreadCount: 0, nextCursor: null }
    else if (path.endsWith('/learners/options')) data = [learner]
    else if (path.endsWith('/learners')) data = { ...paged([learner]), summary: { year1: 0, year2: 1, year3: 0, graduated: 0 } }
    else if (path.endsWith('/monitoring-visits')) data = paged([visit])
    else if (path.endsWith('/assessments')) data = paged([assessment])
    else if (path.endsWith('/placements')) data = paged([placement])
    else if (path.endsWith('/push/public-key')) data = { enabled: false }
    else if (path.endsWith('/idms/status')) data = { enabled: false, institutionEnabled: false }
    return route.fulfill({ json: data })
  })
}

test('mobile navigation hides inactive links and restores focus after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPortal(page, 'Admin')
  await page.goto('/learners')
  await expect(page.getByRole('heading', { name: 'Learner Register' }).last()).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation menu' })
  await expect(page.locator('aside')).toHaveAttribute('inert', '')
  await menu.click()
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await expect(page.locator('aside')).toHaveAttribute('inert', '')
})

test('phone cards retain learner identity and actions without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await mockPortal(page, 'Admin')
  await page.goto('/monitoring-visits')
  const card = page.locator('article').first()
  await expect(card).toContainText(learner.name)
  await expect(card).toContainText('Actions')
  await expect(card.getByRole('button', { name: 'Open menu' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const action = page.getByRole('button', { name: 'Log Visit' })
  const bounds = await action.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
})

test('tablet widths keep learner records usable beside responsive navigation', async ({ page }) => {
  await mockPortal(page, 'Admin')
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/learners')
    await expect(page.locator('article').first()).toContainText(learner.name)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('assessment form uses readable fields and labelled sliders on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPortal(page, 'IndustryPartner')
  await page.goto('/assessments')
  await page.getByRole('button', { name: 'New Assessment' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Competency Assessment' })
  await expect(dialog.getByRole('slider', { name: 'Professionalism (1-5)' })).toBeVisible()
  await expect(dialog.getByRole('slider', { name: 'Problem Solving (1-5)' })).toBeVisible()
  const field = await dialog.getByPlaceholder('Full Name').boundingBox()
  expect(field?.width).toBeGreaterThan(280)
  const scan = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(scan.violations).toEqual([])
})
