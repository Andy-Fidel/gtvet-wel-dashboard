import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { csrfToken: 'test-csrf' } })
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, json: { message: 'Unauthorized' } })
    if (path.includes('/auth/reset-password/') || path.endsWith('/auth/forgot-password')) {
      return route.fulfill({ json: { message: 'Success' } })
    }
    return route.fulfill({ json: {} })
  })
})

test('reset password supports visibility, validation, and successful sign in navigation', async ({ page }) => {
  await page.goto('/reset-password/test-token')
  await expect(page.getByRole('img', { name: 'GTVETS Logo' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('new-password')
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Show new password', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByLabel('Confirm password', { exact: true }).fill('new-password')
  const request = page.waitForRequest(req => req.url().includes('/auth/reset-password/') && req.method() === 'PUT')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  expect((await request).postDataJSON()).toEqual({ newPassword: 'new-password' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Password reset', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('forgot password confirms the email request without disclosing account existence', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email address').fill('user@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'If an account exists' })).toBeVisible()
  await page.getByRole('link', { name: 'Return to sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('recovery screens fit narrow mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  for (const path of ['/forgot-password', '/reset-password/test-token']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible()
  }
  await page.screenshot({ path: '/tmp/password-reset-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/tmp/password-reset-desktop.png', fullPage: true })
})
