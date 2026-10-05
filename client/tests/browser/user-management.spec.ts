import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

const actor = { _id: 'qa-admin', name: 'QA Admin', email: 'admin@example.test', role: 'Admin', status: 'Active', institution: 'QA', region: 'Ashanti' }
const target = { _id: 'qa-staff', name: 'QA Officer', email: 'staff@example.test', role: 'Staff', status: 'Active', institution: 'QA', region: 'Ashanti' }
const emptyBlockers = { learnersOwned: [], activePlacementsOwned: [], partnerPlacementsAssigned: [], supportAssignments: [], supportEscalations: [], delegatedPlacements: [] }

async function setup(page: Page, mode: 'delete' | 'suspend' | 'password') {
  const errors: string[] = []
  const writes: string[] = []
  let released = false, deleted = false
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa-admin', 'seen')
    localStorage.setItem('gtvets-release-read:v1:qa-admin', latest)
  }, releases[0].id)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const impact = { message: 'Resolve the monitoring delegation before removing access.', blockers: { ...emptyBlockers, delegatedPlacements: released ? [] : [{ _id: 'qa-placement', companyName: 'QA Workplace', learnerName: 'QA Learner', institution: 'Origin Institution' }] } }
    if (path === '/api/auth/me') return route.fulfill({ json: { ...actor, passwordChangeRequired: mode === 'password' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa-csrf' } })
    if (path === '/api/users/registry') return route.fulfill({ json: { items: deleted ? [] : [target], page: 1, total: deleted ? 0 : 1, totalPages: deleted ? 0 : 1 } })
    if (path.endsWith('/institution-team-overview')) return route.fulfill({ json: { summary: { teamMembers: 1, managers: 0, guardians: 0, pendingInvites: 0, suspended: 0 }, teamUsers: [target], workloadOwners: [], suspendCandidates: [], reassignmentCandidates: [] } })
    if (path === '/api/users/qa-staff' && method === 'DELETE') {
      writes.push('delete')
      if (!released) return route.fulfill({ status: 409, json: impact })
      deleted = true
      return route.fulfill({ json: { message: 'User deleted' } })
    }
    if (path === '/api/users/qa-staff' && method === 'PUT') {
      writes.push('suspend')
      return route.fulfill({ status: 409, json: { message: 'Another account or assignment update is in progress. Please retry.' } })
    }
    if (path.endsWith('/delegations/qa-placement/release')) {
      writes.push('release'); released = true
      return route.fulfill({ json: { message: 'Monitoring delegation released.' } })
    }
    if (path.endsWith('/deactivation-impact')) return route.fulfill({ json: impact })
    if (path.endsWith('/reassignment-options')) return route.fulfill({ json: { ownerCandidates: [], supportAssignees: [], partnerSupervisors: [] } })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } })
    if (path === '/api/institutions') return route.fulfill({ json: [{ name: 'QA', region: 'Ashanti', programs: [] }] })
    return route.fulfill({ json: {} })
  })
  return { errors, writes }
}

test('registry deletion shows delegation blockers and permits an explicit retry after release', async ({ page }) => {
  const { errors, writes } = await setup(page, 'delete')
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/users')
  const row = page.getByRole('row').filter({ hasText: 'QA Officer' })
  await row.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('menuitem', { name: 'Delete User' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reassign Work Before Removing Access' })
  await expect(dialog.getByText('Monitoring Delegations', { exact: true })).toBeVisible()
  await expect(dialog.getByText('QA Workplace · QA Learner · Origin Institution')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Retry deletion' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Release delegation' }).click()
  await page.getByRole('dialog', { name: 'Success', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Retry deletion' })).toBeEnabled()
  expect(writes).toEqual(['delete', 'release'])
  await dialog.getByRole('button', { name: 'Retry deletion' }).click()
  await page.getByRole('dialog', { name: 'Success', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'QA Officer' })).toHaveCount(0)
  expect(writes).toEqual(['delete', 'release', 'delete'])
  expect(errors).toEqual([])
})

test('a conflict without workload blockers displays its explanation without opening a broken dialog', async ({ page }) => {
  const { errors } = await setup(page, 'suspend')
  await page.goto('/users')
  await page.getByRole('row').filter({ hasText: 'QA Officer' }).getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('menuitem', { name: 'Mark as Inactive' }).click()
  await expect(page.getByText('Another account or assignment update is in progress. Please retry.')).toBeVisible()
  await page.getByRole('alertdialog', { name: 'Unable to complete action' }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'QA Officer' })).toBeVisible()
  expect(errors).toEqual([])
})

test('server password setup requirements open the password form even without a cached flag', async ({ page }) => {
  const { errors } = await setup(page, 'password')
  await page.goto('/users')
  await expect(page.getByRole('heading', { name: 'Change Password', exact: true })).toBeVisible()
  await expect(page.getByText('You must update your temporary password to continue.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('passwordChangeRequired'))).toBe('true')
  expect(errors).toEqual([])
})

test('completed password setup clears a stale cached requirement on reload', async ({ page }) => {
  const { errors } = await setup(page, 'suspend')
  await page.addInitScript(() => localStorage.setItem('passwordChangeRequired', 'true'))
  await page.goto('/users')
  await expect(page.getByRole('row').filter({ hasText: 'QA Officer' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('passwordChangeRequired'))).toBeNull()
  expect(errors).toEqual([])
})
