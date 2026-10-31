import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import releases from '../../src/data/releases.json' with { type: 'json' }

async function setup(page: Page, options: { failOnce?: boolean; empty?: boolean; delay?: boolean } = {}) {
  const requests: URLSearchParams[] = []
  const all = Array.from({ length: 75 }, (_, index) => ({
    _id: `learner-${index}`, name: `Ama Learner ${String(index + 1).padStart(3, '0')}`,
    trackingId: index === 0 ? '=FORMULA()' : `WEL-${index + 1}`, indexNumber: `IDX-${index + 1}`,
    program: 'Electrical', year: 'Year 1', status: 'Pending', institution: index < 40 ? 'School A' : 'School B',
    readiness: { isReadyForPlacement: true, missingFields: [], missingDocuments: [], documentCount: 2 },
  }))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:export-qa', 'seen')
    localStorage.setItem('gtvets-release-read:v1:export-qa', latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'export-qa', name: 'HQ User', role: 'HQStaff', hqScopeType: 'National', status: 'Active' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (path === '/api/learners') {
      const filtered = url.searchParams.has('institution') ? all.slice(0, 40) : all
      if (!url.searchParams.has('page')) {
        requests.push(url.searchParams)
        if (options.delay) await new Promise(resolve => setTimeout(resolve, 1500))
        if (options.failOnce && requests.length === 1) return route.fulfill({ status: 500, json: { message: 'Export unavailable. Try again.' } })
        return route.fulfill({ json: options.empty ? [] : filtered })
      }
      const currentPage = Number(url.searchParams.get('page') || 1)
      return route.fulfill({ json: {
        items: options.empty ? [] : filtered.slice((currentPage - 1) * 25, currentPage * 25),
        total: options.empty ? 0 : filtered.length, totalPages: options.empty ? 0 : Math.ceil(filtered.length / 25), page: currentPage,
        summary: { year1: filtered.length, year2: 0, year3: 0, graduated: 0 },
        programOptions: ['Electrical'], institutionOptions: ['School A', 'School B'], availableIntakeYears: [],
      } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/learners?institution=School+A&search=Ama&program=Electrical')
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled()
  return requests
}

for (const format of ['CSV', 'PDF']) {
  for (const scope of ['Whole register', 'Filtered results', 'Current page']) {
    test(`${format} exports ${scope} with the correct scope and complete rows`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const requests = await setup(page)
      if (scope === 'Current page') {
        await page.getByRole('button', { name: 'Next', exact: true }).click()
        await expect(page.getByText('Showing 26 - 40 of 40 learners')).toBeVisible()
      }
      await page.getByRole('button', { name: `Export ${format}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: `Export learner register to ${format}` })
      await expect(dialog.getByRole('radio', { name: /^Filtered results/ })).toBeChecked()
      await dialog.getByRole('radio', { name: new RegExp(`^${scope}`) }).check()
      const downloadPromise = page.waitForEvent('download')
      await dialog.getByRole('button', { name: `Download ${format}` }).click()
      const download = await downloadPromise
      const text = (await readFile((await download.path())!)).toString(format === 'CSV' ? 'utf8' : 'latin1')
      expect(text).toContain(scope === 'Whole register' ? 'Ama Learner 075' : 'Ama Learner 040')
      if (scope !== 'Whole register') expect(text).not.toContain('Ama Learner 075')
      if (scope === 'Current page') {
        expect(requests).toHaveLength(0)
        expect(text).not.toContain('Ama Learner 001')
        expect(text).toContain('Ama Learner 026')
      } else {
        expect(requests).toHaveLength(1)
        expect(Object.fromEntries(requests[0])).toEqual(scope === 'Whole register' ? {} : { institution: 'School A', search: 'Ama', program: 'Electrical' })
        if (format === 'CSV') expect(text).toContain("'=FORMULA()")
      }
      expect(text).toContain('Ready')
      expect(text).toContain('Active')
      if (format === 'PDF') {
        expect(text).toMatch(/^%PDF-/)
        if (scope !== 'Current page') expect(text).toContain('Page 2')
        await download.saveAs(testInfo.outputPath('learner-register.pdf'))
      }
      await expect(dialog).not.toBeVisible()
    })
  }
}

test('failed exports remain open for retry, and cancel avoids a request', async ({ page }) => {
  const requests = await setup(page, { failOnce: true })
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Export unavailable')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  await download
  expect(requests).toHaveLength(2)
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests).toHaveLength(2)
})

test('mobile dialog supports empty filtered results and current-page disablement', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { empty: true })
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No learners match')
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([])
  await dialog.screenshot({ path: testInfo.outputPath('export-dialog-mobile.png') })
  await dialog.getByRole('radio', { name: /^Current page/ }).check()
  await expect(dialog.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('cancelling an in-flight export prevents a later download and permits reopening', async ({ page }) => {
  const requests = await setup(page, { delay: true })
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(dialog.getByRole('button', { name: 'Preparing…' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  // Let the deliberately delayed response settle; it must not trigger a download after cancellation.
  await page.waitForTimeout(1700)
  expect(downloads).toBe(0)
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Download CSV' })).toBeEnabled()
})

test('without filters defaults to the whole register and honors hidden columns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto('/learners')
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('button', { name: 'Tracking ID', exact: true }).click()
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('radio', { name: /^Whole register/ })).toBeChecked()
  await dialog.screenshot({ path: testInfo.outputPath('export-dialog-desktop.png') })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  const csv = (await readFile((await (await download).path())!)).toString('utf8')
  expect(csv).not.toContain('Tracking ID')
  expect(csv).not.toContain('FORMULA')
  expect(csv).toContain('Ama Learner 075')
})
