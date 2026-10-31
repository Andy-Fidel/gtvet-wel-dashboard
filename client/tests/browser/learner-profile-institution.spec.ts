import { test, expect } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

for (const [role, institution] of [
  ['SuperAdmin', 'Kumasi Technical Institute'],
  ['HQManager', 'Kumasi Technical Institute'],
  ['HQStaff', 'Ghana Technical and Vocational Education and Training Institute for Applied Engineering'],
  ['HQStaff', ''],
]) {
  test(`${role} sees institution ${institution || 'missing fallback'} on the learner profile`, async ({ page }) => {
    await page.setViewportSize({ width: role === 'HQStaff' ? 390 : 1440, height: 900 })
    const learner = { _id: '507f1f77bcf86cd799439011', name: 'Ama Mensah', firstName: 'Ama', lastName: 'Mensah', institution, program: 'Electrical', trackingId: 'WEL-001', year: 'Year 1', status: 'Pending' }
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(latest => {
      localStorage.setItem('gtvets-help-auto-started:v1:profile-qa', 'seen')
      localStorage.setItem('gtvets-release-read:v1:profile-qa', latest)
      localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
    }, releases[0].id)
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'profile-qa', name: 'HQ User', role, hqScopeType: 'National', status: 'Active' } })
      if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
      if (path === '/api/learners') return route.fulfill({ json: { items: [learner], total: 1, totalPages: 1, summary: { year1: 1, year2: 0, year3: 0, graduated: 0 }, institutionOptions: institution ? [institution] : [], programOptions: ['Electrical'] } })
      if (path.endsWith('/profile')) return route.fulfill({ json: { learner, placements: [], visits: [], semesterReports: [], assessments: [], evaluations: [] } })
      if (path.endsWith('/progress')) return route.fulfill({ json: { progress: null } })
      if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
      return route.fulfill({ json: [] })
    })
    await page.goto('/learners')
    await page.getByRole('button', { name: 'Open menu', exact: true }).filter({ visible: true }).click()
    await page.getByRole('menuitem', { name: 'View Profile', exact: true }).click()
    await expect(page).toHaveURL(/\/learners\/507f1f77bcf86cd799439011$/)
    await expect(page.getByRole('definition').filter({ hasText: institution || 'Not recorded' })).toBeVisible()
    await expect(page.getByRole('term').filter({ hasText: /^Institution$/ })).toBeVisible()
    const institutionBox = await page.getByRole('definition').filter({ hasText: institution || 'Not recorded' }).boundingBox()
    expect(institutionBox).not.toBeNull()
    expect(institutionBox!.x + institutionBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(errors).toEqual([])
  })
}
