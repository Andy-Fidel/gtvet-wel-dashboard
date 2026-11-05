import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import releases from '../../src/data/releases.json' with { type: 'json' }

const ticketId = '507f1f77bcf86cd799439013'
const userId = '507f1f77bcf86cd799439011'
const learnerId = '507f1f77bcf86cd799439014'
const placementId = '507f1f77bcf86cd799439015'
const ticket = {
  _id: ticketId, subject: 'Placement approval blocked', category: 'Workflow', priority: 'High',
  description: 'Approval fails.\nThe learner cannot proceed.', status: 'Open',
  createdAt: '2026-11-01T08:00:00Z', firstResponseDueAt: '2026-11-01T12:00:00Z',
  institution: 'School A', region: 'Ashanti', requester: { _id: userId, name: 'Institution Officer' },
  awaitingParty: 'Support', hasUnreadChanges: true, replies: [], documents: [],
  activity: [{ _id: 'event', actorName: 'HQ Officer', detail: 'Assigned to Regional Officer', createdAt: '2026-11-01T09:00:00Z' }],
}
async function setup(page: Page, role = 'Admin', intercept?: (url: URL, body: Record<string, string>) => void) {
  await page.addInitScript(({ latest, userId }) => {
    localStorage.setItem(`gtvets-help-auto-started:v1:${userId}`, 'seen')
    localStorage.setItem(`gtvets-release-read:v1:${userId}`, latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, { latest: releases[0].id, userId })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const body = route.request().method() === 'GET' ? {} : route.request().postDataJSON() || {}
    intercept?.(url, body)
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: userId, role, name: 'QA Officer', institution: 'School A', hqScopeType: 'National', status: 'Active' } })
    if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (url.pathname === '/api/institutions') return route.fulfill({ json: [{ name: 'School A', region: 'Ashanti' }, { name: 'School B', region: 'Ahafo' }] })
    if (url.pathname === '/api/support-context') return route.fulfill({ json: {
      learners: [{ _id: learnerId, name: 'Ama Learner', trackingId: 'WEL-QA', institution: 'School A' }],
      placements: url.searchParams.has('learnerId') ? [{ _id: placementId, companyName: 'QA Workshop', status: 'Active' }] : [],
    } })
    if (url.pathname === '/api/support-tickets' && route.request().method() === 'POST') {
      await new Promise(resolve => setTimeout(resolve, 300))
      return route.fulfill({ json: { ...ticket, ...body }, status: 201 })
    }
    if (url.pathname.endsWith('/replies')) {
      await new Promise(resolve => setTimeout(resolve, 300))
      return route.fulfill({ json: ticket })
    }
    if (url.pathname === '/api/support-tickets/assignees') return route.fulfill({ json: [] })
    if (url.pathname === '/api/support-tickets') return route.fulfill({ json: {
      items: [ticket], total: 1, page: 1, totalPages: 1,
      stats: { total: 1, unread: 1, ownedByMe: 0, awaitingMe: 1 }, hqQueueStats: { awaitingSupport: 1, unassigned: 1 },
    } })
    return route.fulfill({ json: [] })
  })
}

for (const role of ['HQManager', 'HQStaff']) {
  test(`${role} has HQ oversight and can mark seen without mutation controls`, async ({ page }, info) => {
    const calls: string[] = []
    await setup(page, role, url => calls.push(url.pathname))
    await page.goto('/support-center')
    await expect(page.getByRole('heading', { name: 'Help & Support · HQ' })).toBeVisible()
    await expect(page.getByText('Read-only oversight', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New ticket', exact: true })).toHaveCount(0)
    if (role === 'HQManager') await page.screenshot({ path: info.outputPath('support-hq.png'), fullPage: true })
    await page.getByRole('button', { name: 'View details' }).click()
    await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Resolve ticket' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Mark seen' }).click()
    await expect.poll(() => calls.includes(`/api/support-tickets/${ticketId}/read`)).toBe(true)
    await page.getByRole('button', { name: 'Awaiting support' }).click()
    await expect(page).toHaveURL(/queueView=support/)
  })
}

test('HQ filters and sort survive reload and can be cleared', async ({ page }) => {
  const requests: string[] = []
  await setup(page, 'SuperAdmin', url => { if (url.pathname === '/api/support-tickets') requests.push(url.search) })
  await page.goto('/support-center')
  await page.getByLabel('Region', { exact: true }).selectOption('Ashanti')
  await page.getByLabel('Institution', { exact: true }).selectOption('School A')
  await page.getByLabel('Ticket type').selectOption('Incident')
  await page.getByLabel('Sort by').selectOption('priority')
  await expect(page).toHaveURL(/institution=School\+A/)
  await page.reload()
  await expect(page.getByLabel('Region', { exact: true })).toHaveValue('Ashanti')
  await expect(page.getByLabel('Institution', { exact: true })).toHaveValue('School A')
  await expect(page.getByLabel('Sort by')).toHaveValue('priority')
  await expect.poll(() => requests.some(query => query.includes('ticketType=Incident') && query.includes('institution=School+A'))).toBe(true)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByLabel('Institution', { exact: true })).toHaveValue('')
  await expect(page).not.toHaveURL(/institution=/)
})

test('institution creation carries authorized context and prevents double submission', async ({ page }) => {
  const bodies: Array<Record<string, string>> = []
  await setup(page, 'Admin', (url, body) => { if (url.pathname === '/api/support-tickets' && body.subject) bodies.push(body) })
  await page.goto('/support-center')
  await page.getByRole('button', { name: 'New ticket', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Open Support Ticket' })
  await dialog.getByLabel('Subject', { exact: true }).fill('Please check approval')
  await dialog.getByLabel('Description', { exact: true }).fill('The approval screen reports an error.')
  await dialog.getByLabel('Related learner', { exact: true }).selectOption(learnerId)
  await dialog.getByLabel('Related placement', { exact: true }).selectOption(placementId)
  await dialog.getByRole('button', { name: 'Submit Ticket' }).dblclick()
  await expect(dialog).not.toBeVisible()
  expect(bodies).toHaveLength(1)
  expect(bodies[0].learnerId).toBe(learnerId)
  expect(bodies[0].placementId).toBe(placementId)
  await expect(page.getByLabel('Reply', { exact: true })).toBeVisible()
})

test('conversation comes first, retries retain their key, and activity is readable', async ({ page }) => {
  const keys: string[] = []
  await setup(page, 'Admin')
  await page.route('**/api/support-tickets/*/replies', async route => {
    keys.push(route.request().postDataJSON().requestKey)
    await new Promise(resolve => setTimeout(resolve, 250))
    return route.fulfill({ status: keys.length === 1 ? 500 : 200, json: keys.length === 1 ? { message: 'Temporary failure' } : ticket })
  })
  await page.goto(`/support-center?ticket=${ticketId}`)
  const reply = page.getByLabel('Reply', { exact: true })
  const conversationOrder = await reply.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('summary')!) & Node.DOCUMENT_POSITION_FOLLOWING))
  expect(conversationOrder).toBe(true)
  await reply.fill('Please review the placement.')
  const send = page.getByRole('button', { name: 'Send reply' })
  await send.dblclick()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(send).toBeEnabled()
  expect(keys).toHaveLength(1)
  await page.reload()
  await expect(reply).toHaveValue('Please review the placement.')
  await send.click()
  await expect(reply).toHaveValue('')
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByText('Ticket activity', { exact: true }).click()
  await expect(page.getByText('Assigned to Regional Officer', { exact: false })).toBeVisible()
})

test('mobile queue fits viewport and FAQs are searchable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, 'Admin')
  await page.goto('/support-center')
  await expect(page.getByText('Placement approval blocked', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters and sorting', exact: true })).toBeVisible()
  const violations = (await new AxeBuilder({ page }).include('.support-center').analyze()).violations
  expect(violations).toEqual([])
  const widths = await page.locator('.support-center').evaluate(element => ({ content: element.scrollWidth, viewport: document.documentElement.clientWidth }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  await page.screenshot({ path: info.outputPath('support-mobile.png'), fullPage: true })
  await page.getByRole('tab', { name: 'FAQ', exact: true }).click()
  await page.getByLabel('Search frequently asked questions').fill('close')
  await page.getByRole('button', { name: 'Can I close a ticket myself?' }).click()
  await expect(page.getByText('Once support marks', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'How do I get faster help?' })).toHaveCount(0)
})
