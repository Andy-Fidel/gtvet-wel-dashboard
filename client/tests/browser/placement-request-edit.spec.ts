import { test, expect } from '@playwright/test'

test('pending request edits prefill existing details and save without activation', async ({ page }) => {
  const requestId = '507f1f77bcf86cd799439011', partnerId = '507f1f77bcf86cd799439012', learnerId = '507f1f77bcf86cd799439013';
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const learner = { _id: learnerId, name: 'QA Learner', firstName: 'QA', lastName: 'Learner', program: 'Automotive', year: 'Year 1', readiness: { isReadyForPlacement: true, missingFields: [] }, placementEligibility: { isEligible: true } };
  const partner = { _id: partnerId, name: 'QA Partner', sector: 'Automotive', region: 'Ashanti', location: 'Registry workplace', status: 'Active', approvalStatus: 'Approved', totalSlots: 0, usedSlots: 0, programs: [], coordinates: { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' }, institutionCapacity: { availableSlots: 0 } };
  let request = { _id: requestId, institution: 'QA', status: 'Submitted', sourceType: 'InstitutionFound', workflowVersion: 4, canEdit: true, partner, learners: [learner], submittedBy: { _id: 'qa', name: 'QA Staff' }, program: 'Automotive', requestedSlots: 1, placementRegion: 'Central', startDate: '2026-10-12', endDate: '2026-11-12', createdAt: '2026-10-09', supervisorName: 'Saved supervisor', supervisorPhone: '0000000000', worksiteLocation: 'Saved worksite', worksiteMode: 'FixedSite', coordinates: { lat: 5.6, lng: -0.2, precision: 'Actual' } };
  await page.addInitScript(() => localStorage.setItem('gtvets-help-auto-started:v1:qa', 'seen'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      const body = route.request().postDataJSON(); writes.push({ path, method: route.request().method(), body });
      request = { ...request, supervisorName: body.supervisorName, endDate: body.endDate, workflowVersion: 5 };
      return route.fulfill({ json: request });
    }
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'qa', name: 'QA Staff', institution: 'QA', role: 'Staff', region: 'Ashanti', status: 'Active' } });
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } });
    if (path === '/api/placement-requests') return route.fulfill({ json: [request] });
    if (path === '/api/industry-partners') return route.fulfill({ json: [partner] });
    if (path === '/api/learners/placement-options') return route.fulfill({ json: [learner] });
    if (path === '/api/placements') return route.fulfill({ json: { items: [], total: 0, totalPages: 0 } });
    if (path === '/api/placements/delegated-to-me') return route.fulfill({ json: [] });
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, total: 0 } });
    if (path === '/api/placement-transfers') return route.fulfill({ json: { items: [], total: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/placements');
  await page.getByRole('tab', { name: 'Placement Batches / History' }).click();
  await page.getByRole('button', { name: 'Edit request', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit placement request' });
  await expect(dialog.getByLabel('Start Date *', { exact: true })).toHaveValue('2026-10-12');
  await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue('5.6');
  await expect(dialog.getByRole('combobox', { name: 'Placement Region *', exact: true })).toHaveText('Central');
  await expect(dialog.getByLabel('Workplace Supervisor', { exact: true })).toHaveValue('Saved supervisor');
  await dialog.getByLabel('Workplace Supervisor', { exact: true }).fill('Corrected supervisor');
  await dialog.getByLabel('End Date *', { exact: true }).fill('2026-11-13');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ method: 'PUT', path: `/api/placement-requests/${requestId}`, body: { sourceVersion: 4, supervisorName: 'Corrected supervisor', endDate: '2026-11-13', placementRegion: 'Central', learners: [learnerId], partner: partnerId, coordinates: { lat: 5.6, lng: -0.2, precision: 'Actual' } } });
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and activate' })).toHaveCount(0);
});
