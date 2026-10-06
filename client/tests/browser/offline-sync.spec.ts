import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }

const actor = { _id: '507f1f77bcf86cd799439011', name: 'QA Staff', email: 'staff@example.test', role: 'Staff', status: 'Active', institution: 'QA', region: 'Ashanti' }
const queueKey = `gtvets-offline-mutation-queue:user:${actor._id}`
const action = (id: string, status = 'pending') => ({ id, url: '/api/monitoring-visits', method: 'POST', body: JSON.stringify({ learner: '507f1f77bcf86cd799439012' }), headers: { 'Content-Type': 'application/json', 'X-Offline-Action': crypto.randomUUID() }, queuedAt: new Date().toISOString(), syncStatus: status })

async function setup(page: Page, queued: ReturnType<typeof action>[] = []) {
  await page.addInitScript(({ actor, latest, queueKey, queued }) => {
    localStorage.setItem('gtvets-offline-storage-scope', `user:${actor._id}`)
    localStorage.setItem(queueKey, JSON.stringify(queued))
    localStorage.setItem(`gtvets-help-auto-started:v1:${actor._id}`, 'seen')
    localStorage.setItem(`gtvets-release-read:v1:${actor._id}`, latest)
  }, { actor, latest: releases[0].id, queueKey, queued })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: actor })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa-token' } })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0 } })
    return route.fulfill({ json: [] })
  })
}

test('sync preserves work queued while a request is in flight', async ({ page }) => {
  await setup(page)
  let calls = 0
  await page.route('**/api/monitoring-visits', async route => {
    calls++
    if (calls === 1) return route.abort()
    await page.evaluate(({ queueKey, added }) => {
      const queue = JSON.parse(localStorage.getItem(queueKey) || '[]')
      queue.push(added)
      localStorage.setItem(queueKey, JSON.stringify(queue))
    }, { queueKey, added: action('B') })
    return route.fulfill({ json: { _id: 'saved-A' } })
  })
  await page.goto('/offline-sync')
  await expect(page.getByRole('heading', { name: 'Offline Sync Center' })).toBeVisible()
  await page.evaluate(async () => {
    const ctx = (globalThis as unknown as { __gtvetsAuthContextValue__: { authFetch: (url: string, options: RequestInit) => Promise<Response> } }).__gtvetsAuthContextValue__
    const response = await ctx.authFetch('/api/monitoring-visits', { method: 'POST', body: JSON.stringify({ learner: '507f1f77bcf86cd799439012' }) })
    if (response.status !== 202) throw new Error('Expected offline queue acknowledgement')
  })
  await page.getByRole('button', { name: 'Sync Now' }).click()
  await expect.poll(() => page.evaluate(queueKey => JSON.parse(localStorage.getItem(queueKey) || '[]').map((item: { id: string }) => item.id), queueKey)).toEqual(['B'])
})

test('failed security initialization releases the sync lock and permits retry', async ({ page }) => {
  await setup(page, [action('A')])
  await page.route('**/api/auth/csrf', route => route.fulfill({ status: 400, json: { message: 'Security initialization unavailable' } }))
  await page.goto('/offline-sync')
  const sync = page.getByRole('button', { name: 'Sync Now' })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sync).toBeEnabled()
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'qa-token' } }))
  await page.route('**/api/monitoring-visits', route => route.fulfill({ json: { _id: 'saved' } }))
  await sync.click()
  await expect.poll(() => page.evaluate(queueKey => JSON.parse(localStorage.getItem(queueKey) || '[]').length, queueKey)).toBe(0)
})

test('review actions are not automatically sent and other users drafts stay hidden', async ({ page }) => {
  await setup(page, [action('review', 'needs-review')])
  let writes = 0
  await page.route('**/api/monitoring-visits', route => { writes++; return route.fulfill({ json: {} }) })
  await page.addInitScript(actor => {
    localStorage.setItem('draft:monitoring-visit:other-user:new', JSON.stringify({ notes: 'Private other-user notes' }))
    localStorage.setItem('draft:other-user:attendance-log:new', JSON.stringify({ notes: 'Private attendance' }))
    localStorage.setItem(`draft:${actor._id}:attendance-log:new`, JSON.stringify({ notes: 'My attendance draft' }))
  }, actor)
  await page.goto('/offline-sync')
  await expect(page.getByText('My attendance draft')).toBeVisible()
  await expect(page.getByText('Private other-user notes')).toHaveCount(0)
  await expect(page.getByText('Private attendance')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sync Now' }).click()
  await expect(page.getByRole('button', { name: 'Sync Now' })).toBeEnabled()
  expect(writes).toBe(0)
  await page.getByRole('button', { name: 'Clear Queue' }).click()
  await expect(page.getByRole('dialog', { name: 'Discard saved work?' })).toBeVisible()
  expect(await page.evaluate(queueKey => JSON.parse(localStorage.getItem(queueKey) || '[]').length, queueKey)).toBe(1)
})

test('review retains the record ID and uses the current version for an update', async ({ page }) => {
  const item = { ...action('edit', 'needs-review'), method: 'PUT', url: '/api/monitoring-visits/507f1f77bcf86cd799439014', body: JSON.stringify({ learner: '507f1f77bcf86cd799439012', keyObservations: 'Queued notes', visitDate: '2026-10-06', clientUpdatedAt: '2026-10-01' }) }
  await setup(page, [item])
  await page.route('**/api/monitoring-visits/507f1f77bcf86cd799439014', route => route.fulfill({ json: { _id: '507f1f77bcf86cd799439014', updatedAt: '2026-10-05', learner: { _id: '507f1f77bcf86cd799439012' } } }))
  await page.goto('/offline-sync')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Update Visit Record' })).toBeVisible()
  const bridge = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gtvets-offline-conflict-bridge') || 'null'))
  expect(bridge.queueId).toBe('edit')
  expect(bridge.payload._id).toBe('507f1f77bcf86cd799439014')
  expect(bridge.payload.updatedAt).toBe('2026-10-05')
  expect(bridge.payload.keyObservations).toBe('Queued notes')
  await page.evaluate(async () => {
    const ctx = (globalThis as unknown as { __gtvetsAuthContextValue__: { authFetch: (url: string, options: RequestInit) => Promise<Response> } }).__gtvetsAuthContextValue__
    await ctx.authFetch('/api/monitoring-visits/507f1f77bcf86cd799439014', { method: 'PUT', body: JSON.stringify({ keyObservations: 'Corrected notes' }) })
  })
  expect(await page.evaluate(queueKey => JSON.parse(localStorage.getItem(queueKey) || '[]').length, queueKey)).toBe(0)
})

test('offline reload restores recent field access and account-scoped learner options', async ({ page }) => {
  await setup(page)
  await page.route('**/api/learners/options?purpose=monitoring', route => route.fulfill({ json: [{ _id: '507f1f77bcf86cd799439012', name: 'Cached learner' }] }))
  await page.goto('/offline-sync')
  await expect(page.getByRole('heading', { name: 'Offline Sync Center' })).toBeVisible()
  await page.evaluate(async () => {
    const ctx = (globalThis as unknown as { __gtvetsAuthContextValue__: { authFetch: (url: string) => Promise<Response> } }).__gtvetsAuthContextValue__
    await ctx.authFetch('/api/learners/options?purpose=monitoring')
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await page.route('**/api/auth/me', route => route.abort())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Offline Sync Center' })).toBeVisible()
  const result = await page.evaluate(async () => {
    const ctx = (globalThis as unknown as { __gtvetsAuthContextValue__: { authFetch: (url: string) => Promise<Response> } }).__gtvetsAuthContextValue__
    const response = await ctx.authFetch('/api/learners/options?purpose=monitoring')
    return { cached: response.headers.get('X-Offline-Cache'), data: await response.json() }
  })
  expect(result.cached).toBe('true')
  expect(result.data[0].name).toBe('Cached learner')
})
