import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import releases from '../../src/data/releases.json' with { type: 'json' }

for (const scope of ['Whole register', 'Filtered results', 'Current page']) {
  test(`monitoring PDF respects ${scope} and uses the visit workplace`, async ({ page }, info) => {
    const requests: URLSearchParams[] = []
    const visits = Array.from({ length: 32 }, (_, index) => ({
      _id: String(index), visitDate: '2026-10-31T12:00:00Z', visitType: 'Routine',
      attendanceStatus: 'Late', performanceRating: 4, locationVerified: 'Verified',
      gpsReviewStatus: 'ExceptionApproved', isDelegatedVisit: true, delegatedFromInstitution: 'School B',
      institution: 'School A', placement: { companyName: 'Historical Workshop' },
      learner: { name: 'Ama Learner', trackingId: `VISIT-${index + 1}`, program: 'Electrical', placement: { companyName: 'New Workplace' } },
      keyObservations: 'Checked protective equipment and discussed supervision arrangements with the workplace coordinator.',
      issuesIdentified: 'Protective gloves missing', actionRequired: 'Provide gloves before the next shift',
    }))
    await page.addInitScript(latest => {
      localStorage.setItem('gtvets-help-auto-started:v1:visit-export-qa', 'seen')
      localStorage.setItem('gtvets-release-read:v1:visit-export-qa', latest)
      localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
    }, releases[0].id)
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'visit-export-qa', name: 'HQ User', role: 'HQStaff', hqScopeType: 'National', status: 'Active' } })
      if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
      if (url.pathname === '/api/monitoring-visits') {
        if (!url.searchParams.has('page')) {
          requests.push(url.searchParams)
          return route.fulfill({ json: url.searchParams.has('visitType') ? visits.slice(0, 30) : visits })
        }
        return route.fulfill({ json: { items: visits.slice(0, 25), total: 30, totalPages: 2 } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/monitoring-visits?view=records&visitType=Routine')
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Export monitoring visits to PDF' })
    await dialog.getByRole('radio', { name: new RegExp(`^${scope}`) }).check()
    const pending = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download PDF' }).click()
    const download = await pending
    const pdf = (await readFile((await download.path())!)).toString('latin1')
    expect(pdf).toContain(scope === 'Whole register' ? 'VISIT-32' : scope === 'Filtered results' ? 'VISIT-30' : 'VISIT-25')
    if (scope !== 'Whole register') expect(pdf).not.toContain('VISIT-32')
    if (scope === 'Current page') expect(pdf).not.toContain('VISIT-26')
    expect(requests.map(params => Object.fromEntries(params))).toEqual(scope === 'Current page' ? [] : scope === 'Filtered results' ? [{ visitType: 'Routine' }] : [{}])
    expect(pdf).toContain('Historical')
    expect(pdf).not.toContain('New Workplace')
    expect(pdf).toContain('Protective gloves missing')
    expect(pdf).toContain('Provide gloves before the next shift')
    expect(pdf).toContain('4/5')
    expect(pdf).toMatch(/Page 1 of [2-9]/)
    await download.saveAs(info.outputPath('monitoring-visits.pdf'))
  })
}
