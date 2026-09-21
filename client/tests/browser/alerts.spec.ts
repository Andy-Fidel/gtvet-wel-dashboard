import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Exercise the actual root host and Radix form components, with isolated API responses.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not signed in' }) }))
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
})

async function mountForm(page: Page) {
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = (await load('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await load('/node_modules/.vite/deps/react-dom_client.js')).default
    const { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } = await load('/src/components/ui/dialog.tsx')
    const { toast } = await load('/src/lib/toast.ts')
    const h = React.createElement
    function Form() {
      const [open, setOpen] = React.useState(false)
      return h(Dialog, { open, onOpenChange: setOpen },
        h(DialogTrigger, null, 'Open QA form'),
        h(DialogContent, null,
          h(DialogTitle, null, 'QA placement form'),
          h(DialogDescription, null, 'An existing form containing a user draft.'),
          h('label', null, 'Draft name', h('input', { defaultValue: 'Preserved draft' })),
          h('button', { onClick: () => toast.error('Contact number is invalid') }, 'Show error'),
          h('button', { onClick: () => { toast.success('Placement saved'); setOpen(false) } }, 'Save successfully'),
          h('button', { onClick: () => { toast.error('First error'); toast.error('First error'); toast.success('Second confirmation') } }, 'Queue messages'),
          h('button', { onClick: () => toast.error('Long details '.repeat(300), { description: 'Correct the highlighted values and retry.' }) }, 'Long error'),
        ),
      )
    }
    const container = document.createElement('div')
    document.body.append(container)
    createRoot(container).render(h(Form))
  })
  await page.getByRole('button', { name: 'Open QA form' }).click()
  await expect(page.getByRole('dialog', { name: 'QA placement form' })).toBeVisible()
}

test('public error persists until dismissed and restores focus', async ({ page }) => {
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'local-qa' } }))
  await page.route('**/api/auth/forgot-password', route => route.fulfill({ status: 500, json: { message: 'Please try again later' } }))
  await page.getByRole('textbox', { name: 'Email Address' }).fill('qa@example.test')
  await page.getByRole('button', { name: 'Send Reset Link' }).click()
  const alert = page.getByRole('alertdialog', { name: 'Unable to complete action' })
  await expect(alert).toContainText('Please try again later')
  await expect(alert.getByRole('heading')).toBeFocused()
  await page.waitForTimeout(4500) // Explicitly verify the old four-second dismissal cannot recur.
  await expect(alert).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(alert).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeFocused()
})

test('error above a form traps focus, closes with pointer/Escape, and preserves draft', async ({ page }) => {
  await mountForm(page)
  await page.getByRole('button', { name: 'Show error' }).click()
  const alert = page.locator('[data-app-alert]')
  await expect(alert).toBeVisible()
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab')
    expect(await alert.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await page.mouse.click(5, 5)
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Close error message' }).click()
  await expect(alert).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Draft name' })).toHaveValue('Preserved draft')
  await expect(page.getByRole('button', { name: 'Show error' })).toBeFocused()
  await page.getByRole('button', { name: 'Show error' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'QA placement form' })).toBeVisible()
})

test('queued messages display once in order and success does not inherit an error close label', async ({ page }) => {
  await mountForm(page)
  await page.getByRole('button', { name: 'Queue messages' }).click()
  const alert = page.locator('[data-app-alert]')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('First error')
  await expect(alert).toContainText('1 more message')
  await alert.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(alert).toHaveAttribute('role', 'dialog')
  await expect(alert).toContainText('Second confirmation')
  await expect(alert.getByRole('button', { name: 'Close success message' })).toBeVisible()
  await expect(alert.getByRole('heading')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(alert).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Queue messages' })).toBeFocused()
})

test('success survives the source form closing and restores focus to its trigger', async ({ page }) => {
  await mountForm(page)
  await page.getByRole('button', { name: 'Save successfully' }).click()
  const alert = page.getByRole('dialog', { name: 'Success', exact: true })
  await expect(alert).toContainText('Placement saved')
  await expect(alert.getByRole('heading')).toBeFocused()
  await alert.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open QA form' })).toBeFocused()
})

test('long alerts fit a 320px viewport with a scrollable message and visible close controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await mountForm(page)
  await page.getByRole('button', { name: 'Long error' }).click()
  const alert = page.locator('[data-app-alert]')
  const bounds = await alert.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(15)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(305)
  expect(bounds!.y).toBeGreaterThanOrEqual(15)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(553)
  const scrolling = await alert.locator('[id]').evaluateAll(elements => elements.some(element => getComputedStyle(element).overflowY === 'auto' && element.scrollHeight > element.clientHeight))
  expect(scrolling).toBe(true)
  await expect(alert.getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
  await page.screenshot({ path: '/tmp/wel-alerts-mobile.png' })
  await alert.getByRole('button', { name: 'Close', exact: true }).click()
})

test('public success works and password reset navigation waits for acknowledgement', async ({ page }) => {
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { csrfToken: 'local-qa' } }))
  await page.route('**/api/auth/forgot-password', route => route.fulfill({ json: { message: 'Reset instructions sent' } }))
  await page.getByRole('textbox', { name: 'Email Address' }).fill('qa@example.test')
  await page.getByRole('button', { name: 'Send Reset Link' }).click()
  await expect(page.getByRole('dialog', { name: 'Success', exact: true })).toContainText('Reset instructions sent')
  await page.keyboard.press('Escape')
  await page.goto('/reset-password/qa-token')
  await page.route('**/api/auth/reset-password/qa-token', route => route.fulfill({ json: { message: 'Password updated' } }))
  await page.locator('input[type="password"]').nth(0).fill('Password123!')
  await page.locator('input[type="password"]').nth(1).fill('Password123!')
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Success', exact: true })).toContainText('Password updated')
  await expect(page).toHaveURL(/reset-password\/qa-token/)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/login$/)
})

test('error and success dialogs pass automated accessibility checks and are centered', async ({ page }) => {
  await mountForm(page)
  for (const action of ['Show error', 'Save successfully']) {
    await page.getByRole('button', { name: action }).click()
    const alert = page.locator('[data-app-alert]')
    await expect(alert).toHaveAttribute('aria-modal', 'true')
    const box = await alert.boundingBox()
    const viewport = page.viewportSize()!
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(1)
    expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(1)
    const results = await new AxeBuilder({ page }).include('[data-app-alert]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations).toEqual([])
    if (action === 'Save successfully') await page.screenshot({ path: '/tmp/wel-alerts-success.png' })
    await alert.getByRole('button', { name: 'Close', exact: true }).click()
  }
})
