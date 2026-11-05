import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { UserGovernanceData } from '../../src/components/dashboard/UserGovernanceCards'
import releases from '../../src/data/releases.json' with { type: 'json' }
import { buildHqActions, actionCentreResponse } from '../../../server/utils/hqActionCentre.js'
const overview = {
  totalUsers: 0, totalLearners: 10, totalPlacements: 4, totalVisits: 2, totalReports: 7, totalInstitutions: 1, totalPartners: 0, overallPlacementRate: 40,
  institutions: ['QA'], institutionDetails: [], partnersDetails: [], institutionStats: [], regionalStats: [], genderDistribution: [], programDistribution: [], placementTrend: [],
  academicSummary: { currentEnrolled: 8, active: 6, graduating: 2, graduated: 1, dropped: 1 },
  intakeCohorts: [{ intakeAcademicYear: '2026/2027', totalLearners: 10, currentEnrolled: 8, graduating: 2, graduated: 1, regionCount: 1, institutionCount: 1, needAttentionCount: 2 }, { intakeAcademicYear: '__missing_intake__', totalLearners: 3, currentEnrolled: 3, graduated: 0, needAttentionCount: 3 }],
  regionalCohortBreakdown: [], institutionCohortBreakdown: [],
  learnerProgressSummary: { totalLearners: 10, averageProgress: 40, atRiskCount: 2, completedCount: 1, placedCount: 4, ownershipSummary: { assignedCount: 5, unassignedCount: 5, atRiskOwnedCount: 1 } },
  learnerQualitySummary: { activeLearnerCount: 4, overdueAttendanceRate: 25, monitoringCoverageRate: 50, gpsVerifiedRate: 50, avgVisitRating: 4, assessmentCompletionRate: 25, avgAssessmentScore: 75, employerEvaluationCoverageRate: 50, avgEmployerScore: 4, wouldHireRate: 75, assessmentScoreTrend: [{ name: 'Oct', count: 1, avgScore: 75 }], employerOutcomeTrend: [{ name: 'Oct', count: 1, avgScore: 4, wouldHireRate: 75 }] },
  reportPipeline: ['Draft', 'Certified', 'Generated', 'Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected'].map(status => ({ status, count: 1 })),
  approvalInbox: { pendingCount: 0, overdueCount: 0, recentRejectedCount: 0, queue: [], recentRejected: [] },
  supportSummary: { total: 0, open: 0, inProgress: 0, urgentOpen: 0, oldestOpenAgeDays: 0, categoryBreakdown: [], regionBreakdown: [], queue: [] },
  auditSummary: { eventsLast7Days: 0, destructiveEventsLast7Days: 0, authEventsLast7Days: 0, statusChangesLast7Days: 0, topActors: [], recentSensitiveEvents: [] },
  dataQualityAlerts: { stalePendingLearners: 0, placementsMissingSupervisor: 0, pendingAttendanceSignOff: 0, activePlacementsWithoutVisits: 0 },
  userGovernance: { inactiveUsers: 0, pendingPasswordResets: 0, institutionsWithoutActiveAdmins: [], privilegedUserAnomalies: [], roleBreakdown: [] },
  deadlineRisk: { upcomingDeadlines: [], currentCycle: null, overdueInstitutionSubmissions: [], atRiskInstitutions: [] },
}
const reports = Array.from({ length: 16 }, (_, i) => ({ _id: `507f1f77bcf86cd7994390${20+i}`, institution: `School ${i}`, semester: 'Semester 1', academicYear: '2025/2026', yearGroup: 'Year 1', status: 'Regional_Approved', createdAt: '2026-01-01', hqReviewStartedAt: '2026-11-04T10:00:00Z', ageDays: 1 }))
const tickets = Array.from({ length: 27 }, (_, i) => ({ _id: `507f1f77bcf86cd7994390${40+i}`, subject: `Support request ${i}`, status: 'Open', priority: 'Urgent', institution: `School ${i}`, requesterName: 'Officer', createdAt: '2026-10-01', updatedAt: '2026-10-01', firstResponseDueAt: '2026-10-01T01:00:00Z', resolutionDueAt: '2026-10-01T08:00:00Z', replyCount: 0, awaitingParty: 'Support' }))
const obligations = Array.from({ length: 12 }, (_, i) => ({ _id: `deadline-${i}`, deadlineId: '507f1f77bcf86cd799439099', institution: `School ${i}`, region: 'Ashanti', status: 'Missing', code: 'QA', title: 'Year 1 deadline', semester: 'Semester 1', academicYear: '2025/2026', yearGroup: 'Year 1', endDate: '2026-10-01', daysRemaining: 0 }))
const populated = { ...overview, generatedAt: '2026-11-05T12:00:00Z', approvalInbox: { ...overview.approvalInbox, pendingCount: 16, queue: reports }, supportSummary: { ...overview.supportSummary, open: 27, urgentOpen: 27, queue: tickets }, dataQualityAlerts: { stalePendingLearners: 4, placementsMissingSupervisor: 200, pendingAttendanceSignOff: 3, activePlacementsWithoutVisits: 6 }, deadlineRisk: { ...overview.deadlineRisk, overdueInstitutionSubmissions: obligations }, userGovernance: { ...overview.userGovernance, institutionsWithoutActiveAdmins: Array.from({ length: 12 }, (_, i) => ({ _id: String(i), name: `Governance school ${i}`, region: 'Ashanti', code: `QA${i}` })) } }
async function setup(page: Page, role = 'SuperAdmin', data: Omit<typeof populated, 'userGovernance'> & { userGovernance: UserGovernanceData } = populated) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:hq-fix-qa', 'seen')
    localStorage.setItem('gtvets-release-read:v1:hq-fix-qa', latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, releases[0].id)
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { _id: 'hq-fix-qa', name: 'QA HQ Officer', role, status: 'Active', hqScopeType: 'National' } })
    if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (url.pathname === '/api/admin/overview') return route.fulfill({ json: actionCentreResponse({ ...data, actionCentre: { items: buildHqActions(data, role, new Date('2026-11-05T12:00:00Z')) } }, Object.fromEntries(url.searchParams)) })
    if (url.pathname === '/api/users/governance/overview') return route.fulfill({ json: { totalUsers: 0, roleCounts: {}, regionStats: [], riskyAccounts: { items: [], total: 0, page: 1, totalPages: 1 }, dormantPrivilegedAccounts: { items: [], total: 0, page: 1, totalPages: 1 } } })
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } })
    if (url.pathname === '/api/semester-reports') return route.fulfill({ json: { items: [], total: 0, totalPages: 1, cycleReportCount: 0 } })
    if (url.pathname === '/api/placements' || url.pathname === '/api/learners') return route.fulfill({ json: { items: [], total: 0, totalPages: 1 } })
    if (url.pathname === '/api/monitoring-visits') return route.fulfill({ json: { items: [], total: 0, totalPages: 1 } })
    if (url.pathname === '/api/monitoring-visits/due') return route.fulfill({ json: { items: [], total: 0, cadenceDays: 30 } })
    return route.fulfill({ json: [] })
  })
  return errors
}

test('complete queue counts, severity ordering, and all pages remain accessible', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = await setup(page)
  await page.goto('/system-overview')
  const queue = page.getByRole('region', { name: 'HQ work queue' })
  await expect(queue.getByRole('button', { name: 'Support 27', exact: true })).toBeVisible()
  await expect(queue.getByRole('listitem').first()).toContainText('Critical')
  await expect(queue.getByRole('listitem').first()).not.toContainText('missing supervisor')
  const navigationY = await page.getByRole('group', { name: 'HQ dashboard workspace' }).evaluate(element => element.getBoundingClientRect().top)
  expect(navigationY).toBeLessThan(450)
  await queue.getByRole('button', { name: 'Support 27', exact: true }).click()
  await expect(queue).toContainText('Showing 1–10 of 27 items')
  await queue.getByRole('button', { name: 'Next action page' }).click()
  await expect(queue).toContainText('Page 2 of 3')
  await queue.getByRole('button', { name: 'Next action page' }).click()
  await expect(queue).toContainText('Showing 21–27 of 27 items')
  await expect(queue.getByRole('listitem')).toHaveCount(7)
  await page.reload()
  await expect(queue).toContainText('Page 3 of 3')
  await page.screenshot({ path: info.outputPath('hq-action-desktop.png'), fullPage: true })
  expect(errors).toEqual([])
})

for (const role of ['HQStaff', 'HQManager']) test(`${role} receives capability-aware instructions`, async ({ page }) => {
  const errors = await setup(page, role)
  await page.goto('/system-overview?actionCategory=Reports')
  const queue = page.getByRole('region', { name: 'HQ work queue' })
  if (role === 'HQStaff') {
    await expect(queue.getByText('Review report · approval requires HQ Manager', { exact: true }).first()).toBeVisible()
    await expect(queue.getByText('Review and approve or return', { exact: true })).toHaveCount(0)
  } else await expect(queue.getByText('Review and approve or return', { exact: true }).first()).toBeVisible()
  await queue.getByRole('button', { name: 'Support 27', exact: true }).click()
  await expect(queue.getByText('Review ticket · contact its support owner', { exact: true }).first()).toBeVisible()
  await expect(queue.getByText('Assign an owner', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('deadline navigation preserves cycle, missing-submission guidance and return page', async ({ page }) => {
  const queries: URLSearchParams[] = []
  await setup(page)
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/semester-reports') queries.push(url.searchParams) })
  await page.goto('/system-overview?view=operations&actionCategory=Deadlines&actionPage=2')
  const queue = page.getByRole('region', { name: 'HQ work queue' })
  await expect(queue).toContainText('Page 2 of 2')
  await queue.getByRole('listitem').first().getByRole('button').click()
  await expect.poll(() => queries.length).toBeGreaterThan(0)
  expect(queries.at(-1)?.get('semester')).toBe('Semester 1')
  expect(queries.at(-1)?.get('yearGroup')).toBe('Year 1')
  expect(queries.at(-1)?.get('deadlineView')).toBe('overdue')
  await expect(page.getByText('No report has been created for this reporting cohort.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Return to Action Centre' }).click()
  await expect(page).toHaveURL(/actionCategory=Deadlines/)
  await expect(queue).toContainText('Page 2 of 2')
})

test('background refresh and failed refresh preserve an unsaved institution form', async ({ page }) => {
  await page.clock.install()
  const errors = await setup(page)
  await page.goto('/system-overview?view=registries')
  await page.getByRole('button', { name: 'Register School', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Register New Institution' })
  const name = dialog.getByLabel('Institution Name', { exact: true })
  await name.fill('Unsaved QA institution')
  await page.clock.fastForward(5 * 60 * 1000)
  await expect(name).toHaveValue('Unsaved QA institution')
  await page.route('**/api/admin/overview*', route => route.fulfill({ status: 500, json: { message: 'Temporary outage' } }))
  await page.clock.fastForward(5 * 60 * 1000)
  await expect(name).toHaveValue('Unsaved QA institution')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Showing the last successful snapshot')
  expect(errors).toEqual([])
})

test('phone navigation is above the queue and action text passes accessibility checks', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await setup(page, 'HQStaff')
  await page.goto('/system-overview')
  const navigation = page.getByRole('group', { name: 'HQ dashboard workspace' })
  await expect(navigation).toBeVisible()
  expect(await navigation.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(600)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  for (const name of ['Open Reports', 'Open Support']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  }
  const axe = await new AxeBuilder({ page }).include('#hq-action-centre').analyze()
  expect(axe.violations).toEqual([])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transition = await page.locator('.hq-action-row').first().evaluate(element => getComputedStyle(element).transitionDuration)
  expect(transition).toBe('0s')
  await page.screenshot({ path: info.outputPath('hq-action-phone.png'), fullPage: true })
  expect(errors).toEqual([])
})

for (const [field, path, exception] of [
  ['Pending learners older than 14 days', '/api/learners', 'stale-pending'],
  ['Active placements missing supervisor contact', '/api/placements', 'missing-supervisor'],
  ['Attendance awaiting sign-off for 3+ days', '/api/attendance-logs', 'unsigned-overdue'],
  ['Active placements without monitoring visits', '/api/monitoring-visits/due', 'unvisited-placement'],
]) test(`exception destination retains ${exception}`, async ({ page }) => {
  const queries: URLSearchParams[] = []
  await setup(page)
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === path) queries.push(url.searchParams) })
  await page.goto('/system-overview?actionCategory=Data+quality')
  await page.getByRole('region', { name: 'HQ work queue' }).getByRole('listitem').filter({ hasText: field }).getByRole('button').click()
  await expect.poll(() => queries.some(query => query.get('exception') === exception)).toBe(true)
  await expect(page.getByText('Exception filter:', { exact: false })).toBeVisible()
})

test('institution CSV uses safe quoted cells and readable columns', async ({ page }) => {
  const data = { ...populated, institutionStats: [{ _id: '=1+1', totalLearners: 2, placed: 1, pending: 1, completed: 0, dropped: 0 }, { _id: 'A"B\nC', totalLearners: 1, placed: 0, pending: 1, completed: 0, dropped: 0 }] }
  await setup(page, 'SuperAdmin', data as typeof populated)
  await page.goto('/system-overview?view=performance')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export institution breakdown to CSV', exact: true }).click()
  const download = await pending
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('"Institution","Learners"')
  expect(csv).toContain('"\'=1+1"')
  expect(csv).toContain('"A""B\nC"')
})

const governanceFixture: UserGovernanceData = {
  inactiveUsers: 18, pendingPasswordResets: 4,
  roleBreakdown: [{ role: 'HQStaff', count: 12 }, { role: 'Staff', count: 214 }, { role: 'Admin', count: 86 }, { role: 'Manager', count: 62 }, { role: 'RegionalAdmin', count: 18 }, { role: 'HQManager', count: 6 }, { role: 'SuperAdmin', count: 2 }, { role: 'IndustryPartner', count: 24 }, { role: 'Guardian', count: 4 }],
  institutionsWithoutActiveAdmins: Array.from({ length: 8 }, (_, i) => ({ _id: `coverage-${i}`, name: `Coverage school ${i + 1}`, region: 'Ashanti', code: `COV-${i + 1}` })),
  privilegedUserAnomalies: Array.from({ length: 5 }, (_, i) => ({ institution: `Flagged school ${i + 1}`, adminCount: 3, managerCount: 3, privilegedCount: 6, activePrivilegedCount: 4, reasons: ['Multiple admins assigned', 'High privileged-user count'] })),
}
test('governance cards show truthful role shares and page every exception', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = await setup(page, 'SuperAdmin', { ...populated, userGovernance: governanceFixture })
  await page.goto('/system-overview?view=governance')
  const roles = page.getByRole('region', { name: 'Users by Role' })
  await expect(roles.locator('.governance-role-total')).toContainText('428')
  await expect(roles.locator('.governance-role-list > li').first()).toContainText('Staff21450%')
  await expect(roles.locator('.governance-role-list > li').last()).toContainText('Super Admin2<1%')
  const coverage = page.getByRole('region', { name: 'Institutions Without Active Admins' })
  await expect(coverage).toContainText('Showing 1–3 of 8 institutions')
  await page.locator('.governance-cards').screenshot({ path: info.outputPath('governance-desktop.png'), style: '.sticky { opacity: 0 !important; }' })
  await coverage.getByRole('button', { name: 'Next administrator coverage page' }).click()
  await coverage.getByRole('button', { name: 'Next administrator coverage page' }).click()
  await expect(coverage).toContainText('Showing 7–8 of 8 institutions')
  await expect(coverage.getByRole('button', { name: 'Next administrator coverage page' })).toBeDisabled()
  const anomalies = page.getByRole('region', { name: 'Privileged Access Anomalies' })
  await anomalies.getByRole('button', { name: 'Next access anomalies page' }).click()
  await anomalies.getByRole('button', { name: 'Next access anomalies page' }).click()
  await expect(anomalies).toContainText('Showing 5–5 of 5 institutions')
  await expect(anomalies).toContainText('Flags are signals, not confirmed issues')
  await coverage.getByRole('button', { name: 'Review administrator coverage for Coverage school 7', exact: true }).click()
  const url = new URL(page.url())
  expect(url.searchParams.get('institution')).toBe('Coverage school 7')
  expect(url.searchParams.get('governance')).toBe('orphaned-institutions')
  await page.getByRole('button', { name: 'Return to Action Centre' }).click()
  await expect(page).toHaveURL(/view=governance/)
  await page.getByRole('button', { name: 'Review privileged access for Flagged school 1', exact: true }).click()
  expect(new URL(page.url()).searchParams.get('governance')).toBe('privileged-anomalies')
  expect(new URL(page.url()).searchParams.get('institution')).toBe('Flagged school 1')
  expect(errors).toEqual([])
})
for (const role of ['HQStaff', 'HQManager']) test(`${role} can inspect governance without management controls`, async ({ page }) => {
  const errors = await setup(page, role, { ...populated, userGovernance: governanceFixture })
  await page.goto('/system-overview?view=governance')
  const cards = page.locator('.governance-cards')
  await expect(cards.getByText('Contact your user governance administrator')).toHaveCount(2)
  await expect(cards.getByRole('button', { name: /Review|Manage|Open user management/ })).toHaveCount(0)
  await cards.getByRole('button', { name: 'Next access anomalies page' }).click()
  await expect(cards).toContainText('Flagged school 3')
  expect(errors).toEqual([])
})
test('governance empty states and refreshed smaller lists stay usable', async ({ page }) => {
  await setup(page, 'SuperAdmin', { ...populated, userGovernance: governanceFixture })
  await page.goto('/system-overview?view=governance')
  await page.getByRole('button', { name: 'Next administrator coverage page' }).click()
  await page.getByRole('button', { name: 'Next administrator coverage page' }).click()
  await page.route('**/api/admin/overview?**', route => route.fulfill({ json: { ...populated, userGovernance: { ...governanceFixture, institutionsWithoutActiveAdmins: [governanceFixture.institutionsWithoutActiveAdmins[0]], privilegedUserAnomalies: [], roleBreakdown: [] } } }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.governance-cards')).toContainText('Showing 1–1 of 1 institutions')
  await expect(page.locator('.governance-cards')).toContainText('No user data available.')
  await expect(page.locator('.governance-cards')).toContainText('No privileged-access anomalies detected.')
})
test('governance phone cards fit long content and pass accessibility checks', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const data = { ...governanceFixture, institutionsWithoutActiveAdmins: [{ ...governanceFixture.institutionsWithoutActiveAdmins[0], name: 'A very long institution name for administrator coverage verification with additional departments', code: 'LONG-INSTITUTION-CODE-2026' }, ...governanceFixture.institutionsWithoutActiveAdmins.slice(1)] }
  const errors = await setup(page, 'SuperAdmin', { ...populated, userGovernance: data })
  await page.goto('/system-overview?view=governance')
  await expect(page.getByRole('region', { name: 'Users by Role' })).toBeVisible()
  expect(await page.locator('.governance-cards').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const axe = await new AxeBuilder({ page }).include('.governance-cards').analyze()
  expect(axe.violations).toEqual([])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.governance-cards button').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.locator('.governance-cards').screenshot({ path: info.outputPath('governance-phone.png'), style: '.sticky { opacity: 0 !important; }' })
  expect(errors).toEqual([])
})
