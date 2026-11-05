import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeadlineRisk, buildHqActions, actionCentreResponse, reviewStartedAt, latestPlacementActivity, placementActivityByPlacement } from '../utils/hqActionCentre.js';

const now = new Date('2026-11-05T12:00:00Z');
const blank = () => ({ approvalInbox: { queue: [] }, supportSummary: { queue: [] }, deadlineRisk: { overdueInstitutionSubmissions: [], atRiskInstitutions: [] }, userGovernance: { institutionsWithoutActiveAdmins: [], privilegedUserAnomalies: [], pendingPasswordResets: 0 }, dataQualityAlerts: {} });
const ticket = (overrides = {}) => ({ _id: 'ticket', subject: 'Help', institution: 'School A', priority: 'Low', firstResponseDueAt: '2026-11-05T11:00:00Z', resolutionDueAt: '2026-11-07T12:00:00Z', ...overrides });

test('severity always precedes affected-record volume and first-response breach is actionable', () => {
  const data = blank();
  data.supportSummary.queue = [ticket()];
  data.dataQualityAlerts.placementsMissingSupervisor = 10000;
  const actions = buildHqActions(data, 'SuperAdmin', now);
  assert.equal(actions[0].id, 'support:ticket');
  assert.equal(actions[0].priority, 'Critical');
  assert.match(actions[0].timing, /First response overdue/);
  assert.equal(actions[1].priority, 'High');
  assert.equal(actions[1].affectedRecords, 10000);
});

test('role instructions respect approval and support mutation capabilities', () => {
  const data = blank();
  data.supportSummary.queue = [ticket({ awaitingParty: 'Requester' })];
  data.approvalInbox.queue = [{ _id: 'report', institution: 'School A', semester: 'Semester 1', academicYear: '2026/2027', createdAt: '2025-01-01' }];
  const staff = buildHqActions(data, 'HQStaff', now);
  assert.ok(staff.every(row => !/Assign an owner|Review and approve or return/.test(row.nextAction)));
  assert.match(staff.find(row => row.category === 'Support').timing, /Awaiting requester/);
  assert.equal(buildHqActions(data, 'HQManager', now).find(row => row.category === 'Reports').nextAction, 'Review and approve or return');
  assert.match(buildHqActions(data, 'HQManager', now).find(row => row.category === 'Support').nextAction, /Review ticket/);
});

test('unknown stage-entry times never use draft creation as review age', () => {
  assert.equal(reviewStartedAt({ createdAt: '2025-01-01' }, 'SuperAdmin'), null);
  const report = { createdAt: '2025-01-01', reviewHistory: [{ stage: 'Regional', decision: 'Approved', reviewedAt: '2026-11-05T10:00:00Z' }] };
  assert.equal(reviewStartedAt(report, 'SuperAdmin').toISOString(), '2026-11-05T10:00:00.000Z');
  const data = blank(); data.approvalInbox.queue = [report];
  assert.equal(buildHqActions(data, 'SuperAdmin', now)[0].priority, 'High');
  assert.equal(reviewStartedAt(report, 'RegionalAdmin'), null);
});

test('all category items remain reachable and totals are independent of page size', () => {
  const data = blank();
  data.supportSummary.queue = Array.from({ length: 27 }, (_, index) => ticket({ _id: `ticket-${String(index).padStart(2, '0')}` }));
  const snapshot = { generatedAt: now.toISOString(), actionCentre: { items: buildHqActions(data, 'SuperAdmin', now) } };
  const pages = [1, 2, 3].map(actionPage => actionCentreResponse(snapshot, { actionCategory: 'Support', actionPage }).actionCentre);
  assert.deepEqual(pages.map(page => page.items.length), [10, 10, 7]);
  assert.ok(pages.every(page => page.total === 27 && page.totalActions === 27 && page.critical === 27));
  assert.equal(new Set(pages.flatMap(page => page.items.map(row => row.id))).size, 27);
  assert.equal(actionCentreResponse(snapshot, { actionPage: 99 }).actionCentre.page, 3);
  assert.equal(actionCentreResponse(snapshot, { actionPage: -9 }).actionCentre.page, 1);
});

test('older overdue obligations survive a future cycle and respect calendar type and year group', () => {
  const schools = [{ _id: 'single', name: 'Single School', calendarType: 'Single Track' }, { _id: 'trans', name: 'Trans School', calendarType: 'Transitional' }];
  const events = [
    { _id: 'old', title: 'Old deadline', isActive: true, eventType: 'Deadline', semester: 'Semester 1', academicYear: '2025/2026', targetYearGroup: 'Year 1', institutionCalendarType: 'Single Track', endDate: '2026-10-01' },
    { _id: 'new', title: 'New deadline', isActive: true, eventType: 'Deadline', semester: 'Semester 1', academicYear: '2026/2027', targetYearGroup: 'Year 2', institutionCalendarType: 'All', endDate: '2026-11-10' },
  ];
  const result = buildDeadlineRisk(events, schools, [{ institution: 'Trans School', semester: 'Semester 1', academicYear: '2026/2027', yearGroup: 'Year 2', status: 'Submitted' }], now);
  assert.deepEqual(result.overdueInstitutionSubmissions.map(row => [row.institution, row.deadlineId]), [['Single School', 'old']]);
  assert.deepEqual(result.atRiskInstitutions.map(row => [row.institution, row.yearGroup]), [['Single School', 'Year 2']]);
  assert.equal(result.currentCycle.academicYear, '2026/2027');
  const actions = buildHqActions({ ...blank(), deadlineRisk: result }, 'HQStaff', now);
  const url = new URL(actions[0].target, 'https://qa.test');
  assert.equal(url.searchParams.get('academicYear'), '2025/2026');
  assert.equal(url.searchParams.get('yearGroup'), 'Year 1');
  assert.equal(url.searchParams.get('deadlineId'), 'old');
});

test('date-only deadlines remain open through the selected final day', () => {
  const events = [{ _id: 'today', eventType: 'Deadline', semester: 'Semester 1', academicYear: '2026/2027', endDate: '2026-11-05' }];
  const risk = buildDeadlineRisk(events, [{ _id: 'school', name: 'School' }], [], now);
  assert.equal(risk.overdueInstitutionSubmissions.length, 0);
  assert.equal(risk.atRiskInstitutions.length, 1);
});

test('only activity belonging to the current placement and date window receives credit', () => {
  const placements = [{ _id: 'new', learner: 'learner', partner: 'current-host', startDate: '2026-10-01', endDate: '2026-12-01' }];
  const records = [
    { placement: 'old', visitDate: '2026-11-01' },
    { placement: 'new', visitDate: '2026-09-01' },
    { placement: 'new', visitDate: '2026-11-06' },
    { learner: 'learner', visitDate: '2026-11-01' },
  ];
  assert.equal(latestPlacementActivity(placements, records, 'visitDate', { now }).size, 0);
  records.push({ placement: 'new', visitDate: '2026-10-31' });
  assert.equal(latestPlacementActivity(placements, records, 'visitDate', { now }).get('new').visitDate, '2026-10-31');
  const evaluations = [{ learner: 'learner', partner: 'old-host', evaluationDate: '2026-11-01' }, { learner: 'learner', partner: 'current-host', evaluationDate: '2026-09-30' }];
  assert.equal(latestPlacementActivity(placements, evaluations, 'evaluationDate', { employer: true, now }).size, 0);
});

test('support timing shows the earliest SLA clock even while awaiting a requester', () => {
  const data = blank();
  data.supportSummary.queue = [ticket({ firstResponseDueAt: '2026-11-06', resolutionDueAt: '2026-11-04', awaitingParty: 'Requester' })];
  const action = buildHqActions(data, 'SuperAdmin', now)[0];
  assert.equal(action.priority, 'Critical');
  assert.match(action.timing, /Awaiting requester reply · Resolution overdue/);
});

test('quality trends retain every valid assessment in the current placement window', () => {
  const placements = [{ _id: 'current', startDate: '2026-10-01' }];
  const records = [{ placement: 'current', assessmentDate: '2026-10-05' }, { placement: 'current', assessmentDate: '2026-11-01' }, { placement: 'old', assessmentDate: '2026-11-01' }];
  assert.equal(placementActivityByPlacement(placements, records, 'assessmentDate', { now }).get('current').length, 2);
  assert.equal(latestPlacementActivity(placements, records, 'assessmentDate', { now }).get('current').assessmentDate, '2026-11-01');
});
