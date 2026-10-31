import { test, expect } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

for (const role of ['SuperAdmin', 'HQManager', 'HQStaff']) {
  test(`${role} filters by school with search, resets pagination and clears filters`, async ({ page }) => {
    await page.setViewportSize({ width: role === 'HQStaff' ? 390 : 1440, height: 900 })
    await page.addInitScript(latest => {
      localStorage.setItem('gtvets-help-auto-started:v1:school-qa', 'seen')
      localStorage.setItem('gtvets-release-read:v1:school-qa', latest)
      localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
    }, releases[0].id)
    const requests: URL[] = []
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'school-qa', role, hqScopeType: 'National', name: 'HQ User', email: 'qa@example.test', status: 'Active' } })
      if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
      if (url.pathname === '/api/learners') {
        requests.push(url)
        const school = url.searchParams.get('institution')
        return route.fulfill({ json: {
          items: [{ _id: '507f1f77bcf86cd799439011', name: school ? 'Ama School A' : 'Ama All Schools', institution: school || 'School B', program: 'Electrical', year: 'Year 1', status: 'Pending' }],
          page: Number(url.searchParams.get('page') || 1), total: school ? 1 : 26, totalPages: school ? 1 : 2, pageSize: 25,
          summary: { year1: school ? 1 : 26, year2: 0, year3: 0, graduated: 0 }, programOptions: ['Electrical'], availableIntakeYears: [], institutionOptions: ['School A', 'School B'],
        } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/learners?search=Ama')
    const school = page.getByRole('combobox', { name: 'School', exact: true })
    await expect(school).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2')
    await school.click()
    await page.getByRole('option', { name: 'School A', exact: true }).click()
    await expect(page).toHaveURL(/institution=School\+A/)
    await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('1')
    expect(requests.at(-1)?.searchParams.get('search')).toBe('Ama')
    await expect(page.getByText('Ama School A', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await page.reload()
    await expect(school).toContainText('School A')
    await school.click()
    await expect(page.getByRole('option', { name: 'School B', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Clear All Filters' }).click()
    await expect(school).toContainText('All schools')
    await expect.poll(() => requests.at(-1)?.searchParams.has('institution')).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
