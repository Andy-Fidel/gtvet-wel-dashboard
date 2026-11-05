import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const color = (element: Element) => getComputedStyle(element).backgroundColor
for (const theme of ['light', 'dark']) for (const width of [1440, 390]) test(`shared selection stays visible in ${theme} at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/tests/fixtures/selected-states.html')
  await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const name of ['Settings', 'Institution Partner Directory', 'Guardian Dashboard', 'Guardian Agreement Signing', 'Help and Support']) {
    const group = page.locator(`[data-probe="${name}"]`)
    const selected = group.getByRole('tab', { selected: true })
    const inactive = group.getByRole('tab', { selected: false })
    expect(await selected.evaluate(color)).not.toBe('rgba(0, 0, 0, 0)')
    expect(await selected.evaluate(color)).not.toBe(await inactive.evaluate(color))
    const firstColor = await selected.evaluate(color)
    await selected.focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('tab').last()).toBeFocused()
    await expect(group.getByRole('tab').last()).toHaveAttribute('aria-selected', 'true')
    expect(await group.getByRole('tab').last().evaluate(color)).toBe(firstColor)
    expect(await group.getByRole('tab').last().evaluate(element => getComputedStyle(element).borderBottomColor)).toBe('rgb(255, 184, 0)')
  }
  for (const name of ['Default versus outline selection buttons', 'HQ Registry summary filters', 'Institution All regions']) {
    const group = page.locator(`[data-probe="${name}"]`)
    expect(await group.locator('[aria-pressed=true]').evaluate(color)).not.toBe(await group.locator('[aria-pressed=false]').evaluate(color))
  }
  const checkbox = page.locator('[data-probe="Shared Checkbox"]')
  expect(await checkbox.getByRole('checkbox', { checked: true }).evaluate(color)).not.toBe('rgba(0, 0, 0, 0)')
  const table = page.locator('[data-probe="Learner Register selected table row"]')
  const selectedRow = table.locator('tr[data-state=selected]')
  const normalRow = table.locator('tr:not([data-state])')
  expect(await selectedRow.evaluate(color)).not.toBe(await normalRow.evaluate(color))
  await selectedRow.hover()
  expect(await selectedRow.evaluate(color)).not.toBe(await normalRow.evaluate(color))
  const calendar = page.locator('[data-probe="Shared Calendar"]')
  const selectedDate = calendar.locator('[data-selected-single=true]')
  const dateColor = await selectedDate.evaluate(color)
  expect(dateColor).not.toBe('rgba(0, 0, 0, 0)')
  await calendar.getByRole('button', { name: /January 11th, 2024/ }).click()
  await expect(calendar.locator('[data-selected-single=true]')).toHaveAttribute('data-day', '1/11/2024')
  expect(await selectedDate.evaluate(color)).toBe(dateColor)
  const range = page.locator('[data-probe="Calendar range"]')
  expect(await range.locator('[data-range-start=true]').evaluate(color)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await range.locator('[data-range-middle=true]').evaluate(color)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await range.locator('[data-range-end=true]').evaluate(color)).toBe(await range.locator('[data-range-start=true]').evaluate(color))
  const validTokens = await page.evaluate(() => ['background', 'foreground', 'primary', 'muted', 'accent', 'ring', 'input', 'destructive'].every(name => CSS.supports('color', `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`)} / 0.2)`)))
  expect(validTokens).toBe(true)
  // These are representative shared controls; full page behavior is covered by portal suites.
  const axe = await new AxeBuilder({ page }).include('[data-probe="Settings"]').include('[data-probe="Shared Calendar"]').include('[data-probe="Shared Checkbox"]').include('[data-probe="HQ Registry summary filters"]').include('[data-probe="Learner Register selected table row"]').include('[data-probe="Placements"]').include('[data-probe="Learner Profile"]').analyze()
  expect(axe.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const [name, file] of [['Settings', 'tabs'], ['Learner Register selected table row', 'rows'], ['Shared Calendar', 'dates']]) {
    await page.locator(`[data-probe="${name}"]`).screenshot({ path: info.outputPath(`${file}-${theme}-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('Settings tabs and session scope expose the current state on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  const scopes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:selection-settings', 'seen'))
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'selection-settings', name: 'QA Admin', role: 'SuperAdmin', status: 'Active' } })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (url.pathname === '/api/academic-terms') return route.fulfill({ json: [] })
    if (url.pathname === '/api/settings/archive-summary') return route.fulfill({ json: null })
    if (url.pathname === '/api/auth/security/sessions') { scopes.push(url.searchParams.get('scope') || ''); return route.fulfill({ json: { sessions: [], total: 0, pageSize: 20 } }) }
    if (url.pathname === '/api/auth/security/mfa') return route.fulfill({ json: { configured: false, enabled: false, recoveryCodesRemaining: 0 } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/settings')
  const security = page.getByRole('tab', { name: 'Security', exact: true })
  const notifications = page.getByRole('tab', { name: 'Notifications', exact: true })
  await expect(notifications).toHaveAttribute('aria-selected', 'true')
  expect(await notifications.evaluate(color)).not.toBe(await security.evaluate(color))
  await security.click()
  const mine = page.getByRole('button', { name: 'My sessions', exact: true })
  const all = page.getByRole('button', { name: 'All users', exact: true })
  await expect(mine).toHaveAttribute('aria-pressed', 'true')
  await all.click()
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await expect(mine).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => scopes.at(-1)).toBe('all')
  await page.mouse.move(0, 0)
  await expect.poll(() => all.evaluate(color)).not.toBe(await mine.evaluate(color))
  await expect(security).toHaveAttribute('aria-selected', 'true')
  expect(errors).toEqual([])
})
