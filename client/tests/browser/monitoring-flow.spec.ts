import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  const checks: string[] = [], writes: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('gtvets-help-auto-started:v1:qa', 'seen');
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success: (position: unknown) => void) { success({ coords: { latitude: 6.68, longitude: -1.62, accuracy: 10 } }) } } });
  });
  const own = '507f1f77bcf86cd799439011', away = '507f1f77bcf86cd799439012';
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'qa', name: 'QA Officer', role: 'Staff', institution: 'QA', status: 'Active' } });
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } });
    if (path === '/api/learners/options') return route.fulfill({ json: [{ _id: own, name: 'Placed learner', institution: 'QA', monitoringLocation: { placementId: own, coordinates: { lat: 6.68, lng: -1.62 }, companyName: 'QA workplace' } }, { _id: away, name: 'Outside learner', institution: 'QA', monitoringLocation: { placementId: away, coordinates: { lat: 6.70, lng: -1.62 } } }, { _id: 'unplaced', name: 'Unplaced learner', monitoringLocation: null }] });
    if (path === '/api/monitoring-visits/location-check') {
      const body = route.request().postDataJSON(); checks.push(body.learner);
      return route.fulfill({ json: { locationVerified: body.learner === own ? 'Verified' : 'Unverified', verificationLocationType: 'Actual', verificationRadiusMetres: 500, distanceFromSite: body.learner === own ? 0 : 2224 } });
    }
    if (path === '/api/monitoring-visits' && route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { _id: own } }); }
    if (path === '/api/monitoring-visits') return route.fulfill({ json: { items: [], total: 0, totalPages: 0 } });
    if (path === '/api/monitoring-visits/due') return route.fulfill({ json: { items: [], total: 0 } });
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/monitoring-visits'); await page.getByRole('button', { name: 'Log Visit', exact: true }).click();
  return { checks, writes };
}

test('placed learner selection immediately checks location; present attendance records late or on-time', async ({ page }) => {
  const { checks, writes } = await setup(page);
  const dialog = page.getByRole('dialog', { name: 'Log Visit' });
  await dialog.getByRole('combobox', { name: 'Learner / Trainee' }).click();
  await expect(page.getByRole('option', { name: 'Unplaced learner' })).toHaveCount(0);
  await page.getByRole('option', { name: 'Placed learner', exact: true }).click();
  await expect(dialog.getByText('Within the actual workplace radius.')).toBeVisible(); expect(checks).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Save Visit Record' }).click();
  await expect(dialog.getByText('Choose late or on-time.')).toBeVisible(); expect(writes).toHaveLength(0);
  await dialog.getByRole('checkbox', { name: 'Late', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'On-time', exact: true }).check();
  await expect(dialog.getByRole('checkbox', { name: 'Late', exact: true })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Late', exact: true }).check();
  await dialog.getByRole('button', { name: 'Save Visit Record' }).click();
  await expect.poll(() => writes.length).toBe(1); expect(writes[0]).toMatchObject({ attendanceStatus: 'Late', placement: '507f1f77bcf86cd799439011' });
});

test('changing learner rechecks GPS; absent requires excused yes/no and outside-location explanation', async ({ page }) => {
  const { checks, writes } = await setup(page);
  const dialog = page.getByRole('dialog', { name: 'Log Visit' });
  await dialog.getByRole('combobox', { name: 'Learner / Trainee' }).click(); await page.getByRole('option', { name: 'Placed learner', exact: true }).click();
  await expect(dialog.getByText('Within the actual workplace radius.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Learner / Trainee' }).click(); await page.getByRole('option', { name: 'Outside learner', exact: true }).click();
  await expect(dialog.getByText('Outside the selected location radius. Explain why to save for review.')).toBeVisible(); expect(checks).toHaveLength(2);
  await dialog.getByRole('combobox', { name: 'Attendance Status' }).click();
  await expect(page.getByRole('option', { name: 'Late', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Absent', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Late', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save Visit Record' }).click(); await expect(dialog.getByText('Choose whether the absence was excused.')).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'No', exact: true }).check(); await dialog.getByRole('checkbox', { name: 'Yes', exact: true }).check();
  await expect(dialog.getByRole('checkbox', { name: 'No', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Save Visit Record' }).click();
  await expect(dialog.getByText('Explain this location exception before saving for review.')).toBeVisible(); expect(writes).toHaveLength(0);
  await dialog.getByRole('textbox', { name: 'Location explanation (if needed)' }).fill('Meeting took place away from the worksite.');
  await dialog.getByRole('button', { name: 'Save Visit Record' }).click();
  await expect.poll(() => writes.length).toBe(1); expect(writes[0]).toMatchObject({ attendanceStatus: 'Excused', learner: '507f1f77bcf86cd799439012' });
});

test('draft recovery retains conditional attendance and switching status clears its previous answer', async ({ page }) => {
  await setup(page);
  let dialog = page.getByRole('dialog', { name: 'Log Visit' });
  await dialog.getByRole('combobox', { name: 'Learner / Trainee' }).click(); await page.getByRole('option', { name: 'Placed learner', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Attendance Status' }).click(); await page.getByRole('option', { name: 'Absent', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Yes', exact: true }).check();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Log Visit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Log Visit' });
  await expect(dialog.getByRole('combobox', { name: 'Attendance Status' })).toHaveText('Absent');
  await expect(dialog.getByRole('checkbox', { name: 'Yes', exact: true })).toBeChecked();
  await dialog.getByRole('combobox', { name: 'Attendance Status' }).click(); await page.getByRole('option', { name: 'Present', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Late', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'On-time', exact: true })).not.toBeChecked();
});
