import { test, expect, type Page } from '@playwright/test'
import releases from '../../src/data/releases.json' with { type: 'json' }
import { readFile } from 'node:fs/promises'

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
const panels = ['Academic Lifecycle', 'Cohort Comparison', 'Learner Risk & Progress', 'Attendance Compliance', 'Monitoring Quality & GPS', 'Assessment Outcomes', 'Employer Evaluation Outcomes']

async function setup(page: Page, role: string, empty = false) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(latest => {
    localStorage.setItem('gtvets-help-auto-started:v1:oversight-qa', 'seen')
    localStorage.setItem('gtvets-release-read:v1:oversight-qa', latest)
    localStorage.setItem('gtvets-pwa-install-dismissed-at', String(Date.now()))
  }, releases[0].id)
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { _id: 'oversight-qa', role, name: 'QA Oversight', email: 'qa@example.test', institution: '', region: 'Ashanti', hqScopeType: 'Region', status: 'Active' } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'qa' } })
    if (path === '/api/admin/overview') return route.fulfill({ json: { ...overview, ...(empty ? { reportPipeline: [], intakeCohorts: [] } : {}) } })
    if (path === '/api/learners/progress/bulk') return route.fulfill({ json: { learners: [], total: 0, totalPages: 0, stats: overview.learnerProgressSummary } })
    if (path === '/api/notifications') return route.fulfill({ json: { items: [], unreadCount: 0 } })
    if (path === '/api/semester-reports') return route.fulfill({ json: { items: [], total: 0, totalPages: 0 } })
    if (path === '/api/push/public-key') return route.fulfill({ json: { enabled: false } })
    return route.fulfill({ json: [] })
  })
  return errors
}

for (const role of ['SuperAdmin', 'HQManager', 'HQStaff']) {
  test(`${role} can discover oversight pages and open the intervention queue`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const errors = await setup(page, role)
    await page.goto('/system-overview')
    const sidebar = page.getByRole('complementary', { name: 'Main navigation' })
    for (const [name, path] of [['Learner Register', '/learners'], ['Learner Risk & Progress', '/learner-progress'], ['Placements', '/placements'], ['Attendance Logs', '/attendance-logs']]) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toHaveAttribute('href', path)
    }
    if (role !== 'SuperAdmin') await expect(sidebar.getByRole('link', { name: 'User Governance' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Learner Oversight Progress, attendance and outcomes', exact: true }).click()
    const section = page.getByRole('region', { name: 'Learner oversight' })
    for (const panel of panels) await expect(section.getByText(panel, { exact: true })).toBeVisible()
    await expect(section.getByText('25%', { exact: true }).first()).toBeVisible()
    await expect(page.locator('button button')).toHaveCount(0)
    await section.getByRole('link', { name: 'View 2 learners needing attention for 2026/2027', exact: true }).first().click()
    await expect(page).toHaveURL(/\/learner-progress\?.*risk=at-risk/)
    await expect(page.getByRole('heading', { name: 'Learner Progress Dashboard' })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('National pipeline links preserve the chosen stage and empty stages show zero', async ({ page }) => {
  const errors = await setup(page, 'SuperAdmin', true)
  await page.goto('/system-overview')
  await expect(page.getByText('Report Approval Pipeline', { exact: true })).toBeVisible()
  const draft = page.getByRole('link', { name: '0 Draft', exact: true })
  await draft.click()
  await expect(page).toHaveURL(/\/semester-reports\?status=Draft$/)
  expect(errors).toEqual([])
})

test('Regional learner panels and report pipeline remain accessible', async ({ page }) => {
  const errors = await setup(page, 'RegionalAdmin')
  await page.goto('/?workspace=learners')
  for (const panel of panels) await expect(page.getByRole('region', { name: 'Learner oversight' }).getByText(panel, { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Insights/ }).click()
  await expect(page.getByText('Report Approval Pipeline', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '1 Certified', exact: true })).toHaveAttribute('href', '/semester-reports?status=Certified')
  expect(errors).toEqual([])
})

test('National learner oversight fits a phone and navigation opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await setup(page, 'HQStaff')
  await page.goto('/system-overview?view=learners')
  await expect(page.getByRole('region', { name: 'Learner oversight' }).getByText('Academic Lifecycle')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Main navigation' }).getByRole('link', { name: 'Attendance Logs', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('cohort comparison exports the displayed totals and links missing intakes correctly', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = await setup(page, 'SuperAdmin')
  await page.goto('/system-overview?view=learners')
  const table = page.getByRole('table', { name: 'Intake cohort comparison' })
  await expect(table.getByRole('row').filter({ hasText: '2026/2027' })).toContainText('10')
  await expect(table.getByRole('row').filter({ hasText: 'Intake year missing' }).getByRole('link', { name: 'Review records' })).toHaveAttribute('href', '/learners?intakeAcademicYear=__missing_intake__')
  await expect(table.getByRole('link', { name: 'View 3 learners needing attention for Intake year missing' })).toHaveAttribute('href', '/learner-progress?intakeAcademicYear=__missing_intake__&risk=at-risk')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadEvent
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('"2026/2027","10","8","1","2"')
  expect(csv).toContain('"Intake year missing","3","3","0","3"')
  expect(csv.split('\r\n')).toHaveLength(3)
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('cohort-table.png') })
  expect(errors).toEqual([])
})

test('phone cohort cards provide the same counts and actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, 'RegionalAdmin')
  await page.goto('/?workspace=learners')
  const card = page.getByRole('article', { name: 'Intake 2026/2027' })
  await expect(card).toContainText('Currently enrolled')
  await expect(card.getByRole('link', { name: 'View 2 learners needing attention for 2026/2027' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('cohort-phone.png') })
})

test('cohort export quotes unsafe text and neutralises formula prefixes', async ({ page }) => {
  await setup(page, 'SuperAdmin')
  await page.route('**/api/admin/overview*', route => route.fulfill({ json: { ...overview, intakeCohorts: [{ intakeAcademicYear: '=1+1', totalLearners: 1, currentEnrolled: 1, graduated: 0, needAttentionCount: 0 }, { intakeAcademicYear: 'A"B\nC', totalLearners: 1, currentEnrolled: 1, graduated: 0, needAttentionCount: 0 }] } }))
  await page.goto('/system-overview?view=learners')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadEvent
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('"\'=1+1"')
  expect(csv).toContain('"A""B\nC"')
})

test('attention list shows readable reasons and cohort actions preserve current filters', async ({ page }) => {
  const errors = await setup(page, 'HQStaff')
  await page.route('**/api/learners/progress/bulk*', route => route.fulfill({ json: {
    learners: [{ learner: { _id: '507f1f77bcf86cd799439011', name: 'QA Learner', trackingId: 'QA-1', program: 'Electrical', year: 'Year 1', academicStatus: 'Active', status: 'Placed', intakeAcademicYear: '2026/2027' }, progress: { overall: 20, atRisk: true, atRiskReasons: ['Monitoring visit overdue'], categoryBreakdown: { placement: 10, assessment: 0, monitoring: 0, documentation: 0 } } }],
    total: 1, totalPages: 1, programOptions: ['Electrical'], intakeAcademicYearOptions: ['2026/2027'], stats: { ...overview.learnerProgressSummary, intakeCohorts: overview.intakeCohorts },
  } }))
  await page.goto('/learner-progress?program=Electrical&risk=at-risk')
  await expect(page.getByRole('list', { name: 'Follow-up reasons' })).toHaveText('Monitoring visit overdue')
  const table = page.getByRole('table', { name: 'Intake cohort comparison' })
  await expect(table.getByRole('link', { name: 'View 2 learners needing attention for 2026/2027' })).toHaveAttribute('href', /program=Electrical/)
  await expect(table.getByRole('row').filter({ hasText: '2026/2027' })).toContainText('10')
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
