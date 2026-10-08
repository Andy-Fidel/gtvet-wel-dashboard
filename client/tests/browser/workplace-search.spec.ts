import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  const searches: string[] = []
  const writes: string[] = []
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:location-qa', 'seen'))
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET') writes.push(url.pathname)
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'location-qa', role: 'Admin', name: 'QA', email: 'qa@example.test', status: 'Active', institution: 'QA', region: 'Ashanti' } })
    if (url.pathname === '/api/workplace-location-search') {
      searches.push(url.searchParams.get('q') || '')
      return route.fulfill({ json: { results: [{ name: 'Kumasi, Ghana', osmType: 'node', osmId: '123', source: 'OpenStreetMap', precision: 'Town', lat: 6.68, lng: -1.62 }] } })
    }
    if (url.pathname === '/api/industry-partners') return route.fulfill({ json: { items: [], total: 0, totalPages: 1, summary: {} } })
    if (url.pathname === '/api/partner-change-requests') return route.fulfill({ json: { items: [], total: 0 } })
    if (url.pathname === '/api/my-institution') return route.fulfill({ json: { name: 'QA', programs: [] } })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/industry-partners')
  await page.getByRole('button', { name: 'Add Partner', exact: true }).click()
  await page.getByRole('button', { name: 'Register New Partner', exact: true }).click()
  return { searches, writes }
}

test('explicit Ghana search works without submitting or overwriting workplace coordinates', async ({ page }) => {
  const { searches, writes } = await setup(page)
  await page.getByLabel('Latitude', { exact: true }).fill('5.6')
  await page.getByLabel('Longitude', { exact: true }).fill('-0.2')
  const input = page.getByLabel('Search an area or town in Ghana')
  await input.fill('Kumasi')
  expect(searches).toEqual([])
  await input.press('Enter')
  await expect(page.getByText('Kumasi, Ghana', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View town on map' })).toHaveAttribute('href', /openstreetmap.org/)
  await page.getByRole('button', { name: 'Use this town' }).click()
  await expect(page.getByText('Used for general location only; not for visit verification.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Town', { exact: true })).toHaveValue('Kumasi')
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('5.6')
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('-0.2')
  expect(searches).toEqual(['Kumasi']); expect(writes).toEqual([])
  await input.fill('Adenta')
  await page.getByRole('button', { name: 'Remove town location' }).click()
  await expect(page.getByText('Kumasi, Ghana', { exact: true })).toHaveCount(0)
})

test('missing service and no matches have usable fallback on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  await page.route('**/api/workplace-location-search?*', route => route.fulfill({ status: 503, json: { message: 'Location lookup is not configured yet.' } }))
  await page.getByLabel('Search an area or town in Ghana').fill('Adenta')
  await page.getByRole('button', { name: 'Search Ghana' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'not configured' })).toBeVisible()
  await expect(page.getByLabel('Town', { exact: true })).toBeEnabled()
  await page.route('**/api/workplace-location-search?*', route => route.fulfill({ json: { results: [] } }))
  await page.getByRole('button', { name: 'Search Ghana' }).click()
  await expect(page.getByText('No matching locations in Ghana.', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
