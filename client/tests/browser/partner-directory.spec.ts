import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  const queries: URLSearchParams[] = []
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:qa-user', 'seen'))
  const partner = (id: string, name: string, region: string, availableSlots: number) => ({ _id: id, name, region, sector: 'Automotive', town: 'QA town', status: 'Active', approvalStatus: 'Approved', totalSlots: 8, usedSlots: 0, programs: [], coordinates: { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' }, locationVerificationStatus: 'TownSelected', institutionCapacity: { availableSlots, reservedAvailable: 0, sharedAvailable: availableSlots, reservedSlots: 0 } })
  const partners = [partner('507f1f77bcf86cd799439011', 'Home workplace', 'Greater Accra', 4), partner('507f1f77bcf86cd799439012', 'Away workplace', 'Ashanti', 3), partner('507f1f77bcf86cd799439013', 'Full workplace', 'Ashanti', 0)]
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'qa-user', name: 'QA Admin', role: 'Admin', institution: 'QA', region: 'Ashanti', status: 'Active' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path === '/api/industry-partners') {
      if (!url.searchParams.has('directory')) return route.fulfill({ json: partners })
      queries.push(url.searchParams)
      const selectedRegion = url.searchParams.get('region') || 'Greater Accra'
      let items = partners.filter(p => selectedRegion === 'all' || p.region === selectedRegion)
      if (url.searchParams.get('availableOnly') === '1') items = items.filter(p => p.institutionCapacity.availableSlots > 0)
      if (url.searchParams.get('q')) items = items.filter(p => p.name.toLowerCase().includes(url.searchParams.get('q')!.toLowerCase()))
      if (url.searchParams.get('sector') && url.searchParams.get('sector') !== 'Automotive') items = []
      if (url.searchParams.get('view') === 'submissions') return route.fulfill({ json: { items: [{ ...partners[0], name: 'Rejected submission', approvalStatus: 'Rejected', approvalComment: 'Confirm supervisor details', canResubmit: true }], total: 1, totalPages: 1, institutionRegion: 'Greater Accra', selectedRegion: 'all' } })
      return route.fulfill({ json: { items, total: items.length, totalPages: items.length ? 1 : 0, institutionRegion: 'Greater Accra', selectedRegion } })
    }
    if (path === '/api/learners/placement-options') return route.fulfill({ json: [] })
    if (path === '/api/partner-change-requests') return route.fulfill({ json: { items: [], total: 0 } })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    return route.fulfill({ json: {} })
  })
  return queries
}

test('institution region is the default; switching regions and filters query the server', async ({ page }) => {
  const queries = await setup(page)
  await page.goto('/industry-partners')
  await expect(page.getByRole('combobox', { name: 'Browse by region' })).toHaveValue('Greater Accra')
  await expect(page.getByText('Home workplace', { exact: true })).toBeVisible()
  await expect(page.getByText('Away workplace', { exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Browse by region' }).selectOption('Ashanti')
  await expect(page.getByText('Away workplace', { exact: true })).toBeVisible()
  await expect(page.getByText('Full workplace', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use for placement' }).last()).toBeDisabled()
  await page.getByRole('checkbox', { name: 'With available slots' }).check()
  await expect(page.getByText('Full workplace', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Search partner name or town' }).fill('Away')
  await expect.poll(() => queries.at(-1)?.get('q')).toBe('Away')
  await page.getByRole('combobox', { name: 'Sector', exact: true }).selectOption('Automotive')
  await expect.poll(() => queries.at(-1)?.get('sector')).toBe('Automotive')
  expect(queries.at(-1)?.get('region')).toBe('Ashanti')
  expect(queries.at(-1)?.get('availableOnly')).toBe('1')
  expect(queries.at(-1)?.get('page')).toBe('1')
})

test('partner action preselects cross-region host and own submissions remain separate', async ({ page }) => {
  await setup(page)
  await page.goto('/industry-partners')
  await page.getByRole('combobox', { name: 'Browse by region' }).selectOption('Ashanti')
  await page.getByRole('button', { name: 'View details' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Away workplace' })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Use for placement' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Placement with Away workplace' })
  await expect(dialog.getByText('Town location selected', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Placement Region *', exact: true })).toHaveText('Ashanti')
  await dialog.getByRole('combobox', { name: 'Placement Region *', exact: true }).click()
  await page.getByRole('option', { name: 'Central', exact: true }).click()
  await dialog.getByLabel('Start Date *', { exact: true }).fill('2026-10-12')
  await expect(dialog.getByRole('combobox', { name: 'Placement Region *', exact: true })).toHaveText('Central')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByText('Rejected submission', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'My submissions & changes' }).click()
  await expect(page.getByText('Rejected submission', { exact: true })).toBeVisible()
  await expect(page.getByText('Confirm supervisor details', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Correct and resubmit' })).toBeVisible()
})

test('region controls work on mobile and empty filters explain recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/industry-partners')
  await page.getByRole('combobox', { name: 'Browse by region' }).selectOption('Western North')
  await expect(page.getByText('Try another region or clear your search and filters.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('combobox', { name: 'Browse by region' }).selectOption('all')
  await expect(page.getByText('Away workplace', { exact: true })).toBeVisible()
})
