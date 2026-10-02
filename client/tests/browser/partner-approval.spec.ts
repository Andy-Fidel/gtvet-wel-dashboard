import { test, expect, type Page } from '@playwright/test'

const partnerId = '507f1f77bcf86cd799439011'

async function setup(page: Page, role: string, status: string) {
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:qa-user', 'seen'))
  let partner = {
    _id: partnerId, name: 'QA workplace', sector: 'Automotive', region: 'Ashanti',
    totalSlots: 10, usedSlots: 0, status: 'Active', approvalStatus: status, approvalVersion: 3,
    approvalComment: status === 'Rejected' ? 'Confirm the contact person' : '',
    partnerType: 'RegisteredCompany', operatingModel: 'FixedSite', programs: [],
    canRequestChanges: true, canResubmit: status === 'Rejected',
  }
  const writes: { path: string; body: Record<string, unknown> }[] = []
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      writes.push({ path, body })
      if (path.endsWith('/hq-reject')) partner = { ...partner, approvalStatus: 'Rejected', approvalVersion: 4 }
      if (path.endsWith('/resubmit')) partner = { ...partner, ...body, approvalStatus: 'PendingHQApproval', approvalVersion: 4 }
      return route.fulfill({ json: path.endsWith('/change-requests') ? { status: 'HQReview' } : partner })
    }
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'qa-user', role, name: 'QA reviewer', email: 'qa@example.test', status: 'Active', institution: 'QA', region: 'Ashanti', hqScopeType: 'National' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa-csrf' } })
    if (path === '/api/industry-partners') return route.fulfill({ json: { items: [partner], total: 1, totalPages: 1, summary: { total: 1, pending: status === 'PendingHQApproval' ? 1 : 0, approved: status === 'Approved' ? 1 : 0, rejected: status === 'Rejected' ? 1 : 0 } } })
    if (path === '/api/partner-change-requests') return route.fulfill({ json: { items: [], total: 0 } })
    if (path === '/api/hq/partner-insights') return route.fulfill({ json: { summary: {}, regions: [], sectors: [], placements: [], requests: [] } })
    if (path === '/api/my-institution') return route.fulfill({ json: { name: 'QA', programs: [] } })
    if (path === '/api/institutions') return route.fulfill({ json: [{ name: 'QA', programs: [] }] })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } })
    return route.fulfill({ json: {} })
  })
  return writes
}

test('HQ rejection requires a reason and sends the reviewed version', async ({ page }) => {
  const writes = await setup(page, 'HQManager', 'PendingHQApproval')
  await page.goto('/hq-industry-partners')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reject Partner' })
  const submit = dialog.getByRole('button', { name: 'Reject Partner' })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Rejection reason (at least 5 characters)' }).fill('four')
  await expect(submit).toBeDisabled()
  await dialog.getByRole('textbox').fill('Confirm the contact person')
  await submit.click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ path: `/api/industry-partners/${partnerId}/hq-reject`, body: { approvalComment: 'Confirm the contact person', sourceApprovalVersion: 3 } })
})

test('submitting management sees the reason and corrects a rejected registration', async ({ page }) => {
  const writes = await setup(page, 'Manager', 'Rejected')
  await page.goto('/industry-partners')
  await expect(page.getByText('HQ rejection reason:')).toBeVisible()
  await page.getByRole('button', { name: 'Correct and resubmit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Correct and resubmit partner' })
  await dialog.getByRole('textbox', { name: 'Company Name *', exact: true }).fill('Corrected QA workplace')
  await dialog.getByRole('button', { name: 'Resubmit for HQ approval' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].path).toBe(`/api/industry-partners/${partnerId}/resubmit`)
  expect(writes[0].body).toMatchObject({ name: 'Corrected QA workplace', sourceApprovalVersion: 3 })
})

test('regional corrections use the HQ queue instead of editing approved details', async ({ page }) => {
  const writes = await setup(page, 'RegionalAdmin', 'Approved')
  await page.goto('/industry-partners')
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Request changes' }).click()
  const dialog = page.getByRole('dialog', { name: 'Request changes: QA workplace' })
  await dialog.getByRole('textbox', { name: 'General phone' }).fill('0240000000')
  await dialog.getByRole('textbox', { name: 'Reason for changes' }).fill('Confirmed contact phone with employer')
  await dialog.getByRole('button', { name: 'Submit changes for review' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].path).toBe(`/api/industry-partners/${partnerId}/change-requests`)
  expect(writes[0].body).toMatchObject({ proposed: { contactPhone: '0240000000' }, reason: 'Confirmed contact phone with employer' })
})
