import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

const actor = { _id: 'qa-hq', name: 'QA HQ', email: 'hq@example.test', role: 'SuperAdmin', status: 'Active' }
const users = Array.from({ length: 14 }, (_, index) => ({
  _id: `user-${index}`, name: `Officer ${index}`, email: `officer${index}@example.test`,
  role: 'Staff', status: 'Active', institution: index === 13 ? 'Technical College' : 'QA College',
  region: index === 13 ? 'Greater Accra' : 'Ashanti', passwordChangeRequired: true,
}))

async function setup(page: Page) {
  const requests: URL[] = []
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa-hq', 'seen')
    localStorage.setItem('gtvets-release-read:v1:qa-hq', latest)
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: actor })
    if (url.pathname === '/api/users/registry') {
      requests.push(url)
      const query = (url.searchParams.get('q') || '').trim().toLowerCase()
      const items = users.filter(user => [user.name, user.email, user.institution, user.region].some(value => value.toLowerCase().includes(query)))
      const currentPage = Number(url.searchParams.get('page') || 1)
      return route.fulfill({ json: { items: items.slice((currentPage - 1) * 12, currentPage * 12), page: currentPage, total: items.length, totalPages: Math.ceil(items.length / 12) } })
    }
    if (url.pathname === '/api/users') return route.fulfill({ json: users })
    if (url.pathname === '/api/access-approvals') return route.fulfill({ json: [] })
    if (url.pathname === '/api/users/governance/overview') return route.fulfill({ json: {
      totalUsers: 14, roleCounts: { Staff: 14 }, regionStats: [],
      riskyAccounts: { items: [], total: 0, page: 1, totalPages: 0 },
      dormantPrivilegedAccounts: { items: [], total: 0, page: 1, totalPages: 0 },
    } })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } })
    if (url.pathname === '/api/institutions') return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })
  return requests
}

test('HQ search reaches users beyond the current page, resets pagination, and clears', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/users?role=Staff&status=Active')
  const row = (name: string) => page.getByRole('row').filter({ hasText: name })
  await expect(row('Officer 0')).toBeVisible()
  await expect(row('Officer 13')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search users' })
  await search.fill('  OFFICER13@EXAMPLE.TEST  ')
  await expect(row('Officer 13')).toBeVisible()
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
  expect(requests.at(-1)?.searchParams.get('q')).toBe('OFFICER13@EXAMPLE.TEST')
  expect(requests.at(-1)?.searchParams.get('role')).toBe('Staff')
  expect(requests.at(-1)?.searchParams.get('status')).toBe('Active')
  await expect(search).toBeFocused()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(row('Officer 0')).toBeVisible()
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible()
  expect(requests.at(-1)?.searchParams.has('q')).toBe(false)
})

test('HQ search supports institution, region, no matches and whitespace', async ({ page }) => {
  await setup(page)
  await page.goto('/users')
  const search = page.getByRole('searchbox', { name: 'Search users' })
  for (const query of ['technical college', 'greater accra']) {
    await search.fill(query)
    await expect(page.getByRole('row').filter({ hasText: 'Officer 13' })).toBeVisible()
    await expect(page.getByText('Showing 1-1 of 1 users')).toBeVisible()
  }
  await search.fill('unmatched.+')
  await expect(page.getByRole('cell', { name: 'No users match these filters. Try another search or clear the filters.', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await search.fill('   ')
  await expect(page.getByRole('row').filter({ hasText: 'Officer 0' })).toBeVisible()
})

test('search also narrows the selected governance view', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/users?governance=password-reset-pending')
  const search = page.getByRole('searchbox', { name: 'Search users' })
  await search.fill('technical college')
  await expect(page.getByRole('row').filter({ hasText: 'Officer 13' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Officer 0' })).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Officer 0' })).toBeVisible()
})


test('switching between the registry and a governance view resets the table pagination mode', async ({ page }) => {
  await setup(page)
  await page.goto('/users')
  const directory = page.getByRole('region', { name: 'User directory', exact: true })
  await expect(directory.getByText('Showing 1-12 of 14 users', { exact: true })).toBeVisible()
  await page.getByText('Governance, approvals, and team oversight', { exact: false }).click()
  await page.getByRole('button', { name: 'Awaiting decision 0', exact: true }).click()
  await expect(directory.getByText('14 matching users in this view', { exact: true })).toBeVisible()
  await expect(directory.getByRole('row')).toHaveCount(11)
  await directory.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(directory.getByRole('row')).toHaveCount(5)
  await page.getByRole('button', { name: 'Remove View: Pending approvals', exact: true }).click()
  await expect(directory.getByText('Showing 1-12 of 14 users', { exact: true })).toBeVisible()
  await expect(directory.getByRole('row')).toHaveCount(13)
})
