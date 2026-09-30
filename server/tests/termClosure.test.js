import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router, { buildTermClosureData } from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { Placement } from '../models/Placement.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { AuditLog } from '../models/AuditLog.js';
import { Institution } from '../models/Institution.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';
import { learnerYearAt, learnerAcademicStatusAt, learnerProgramAt, placementOverlapsPeriod, isReportSubmittedForDeadline, UNRESOLVED_REPORT_STATUSES } from '../utils/termClosure.js';

const id = () => new mongoose.Types.ObjectId();
const route = action => router.stack.find(layer => layer.route?.path === `/semester-reports/:id/${action}`).route.stack.at(-1).handle;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const query = records => ({ select() { return this; }, lean: async () => records });

test('historical cohort uses progression history and report dates', () => {
  const learner = { year: 'Year 2', academicStatus: 'Graduated', program: 'Welding', graduatedAt: new Date('2027-07-01'), progressionHistory: [
    { action: 'Promoted', fromYear: 'Year 1', toYear: 'Year 2', fromAcademicStatus: 'Graduating', fromProgram: 'Electrical', changedAt: new Date('2027-06-01') },
    { action: 'Graduated', fromYear: 'Year 2', toYear: 'Year 2', fromAcademicStatus: 'Active', changedAt: new Date('2027-07-01') },
  ] };
  assert.equal(learnerYearAt(learner, new Date('2027-03-01')), 'Year 1');
  assert.equal(learnerAcademicStatusAt(learner, new Date('2027-03-01')), 'Graduating');
  assert.equal(learnerProgramAt(learner, new Date('2027-03-01')), 'Electrical');
  assert.equal(placementOverlapsPeriod({ startDate: new Date('2027-01-01'), closedAt: new Date('2027-02-01') }, new Date('2027-03-01'), new Date('2027-04-01')), false);
});

test('deadline requires submitted reports for each year group or a submitted all-year report', () => {
  assert.equal(isReportSubmittedForDeadline([{ yearGroup: 'Year 1', status: 'Draft' }], 'Year 1'), false);
  assert.equal(isReportSubmittedForDeadline([{ yearGroup: 'Year 1', status: 'Certified' }], 'Year 1'), false);
  assert.equal(isReportSubmittedForDeadline([{ yearGroup: 'Year 1', status: 'Submitted' }], 'Year 1'), true);
  assert.equal(isReportSubmittedForDeadline([{ yearGroup: 'Year 1', status: 'Submitted' }], 'All'), false);
  assert.equal(isReportSubmittedForDeadline(['Year 1', 'Year 2', 'Year 3'].map(yearGroup => ({ yearGroup, status: 'Submitted' })), 'All'), true);
  assert.equal(isReportSubmittedForDeadline([{ yearGroup: 'All', status: 'HQ_Approved' }], 'All'), true);
  assert.ok(UNRESOLVED_REPORT_STATUSES.includes('Rejected'));
});

test('closure metrics use the period, approved attendance, and matching placement denominator', async t => {
  const learners = [id(), id()];
  const start = new Date('2027-01-01');
  const end = new Date('2027-06-30');
  const seen = {};
  t.mock.method(Learner, 'find', async filter => {
    seen.learners = filter;
    return learners.map((_id, index) => ({ _id, institution: 'School', year: 'Year 2', academicStatus: 'Active', program: 'Electrical', firstName: `Learner ${index}` }));
  });
  t.mock.method(MonitoringVisit, 'find', filter => { seen.visits = filter; return query([{ learner: learners[0] }, { learner: learners[1] }]); });
  t.mock.method(CompetencyAssessment, 'find', filter => { seen.assessments = filter; return query([{ learner: learners[0] }, { learner: learners[1] }]); });
  t.mock.method(AttendanceLog, 'find', filter => { seen.attendance = filter; return query([{ learner: learners[0], hoursWorked: 8 }]); });
  t.mock.method(SupportTicket, 'countDocuments', async filter => { if (filter.$and) seen.resolved = filter; return 0; });
  t.mock.method(Placement, 'find', filter => { seen.placements = filter; return query([{ learner: learners[0], startDate: start }]); });
  const report = await buildTermClosureData('School', start, end, 'Year 2');
  assert.equal(report.summary.totalLearners, 2);
  assert.equal(report.metrics.placementRate, 50);
  assert.equal(report.metrics.visitCoverage, 100);
  assert.equal(report.metrics.assessmentCoverage, 100);
  assert.equal(report.metrics.totalHoursLogged, 8);
  assert.equal(seen.attendance.status, 'SignedOff');
  assert.equal(seen.assessments.$or[0].assessmentDate.$lte.toISOString(), '2027-06-30T23:59:59.999Z');
  assert.ok(seen.resolved.$and[1].$or[0].resolvedAt);
  assert.equal(report.cohortLearners.length, 2);
});

test('refresh includes the former year group after promotion and preserves captured cohort facts', async t => {
  const learnerId = id();
  const learner = { _id: learnerId, year: 'Year 2', academicStatus: 'Active', program: 'Welding', progressionHistory: [
    { action: 'Promoted', fromYear: 'Year 1', toYear: 'Year 2', fromAcademicStatus: 'Graduating', fromProgram: 'Electrical', changedAt: new Date('2027-07-01') },
  ] };
  t.mock.method(Learner, 'find', async () => [learner]);
  t.mock.method(MonitoringVisit, 'find', () => query([]));
  t.mock.method(CompetencyAssessment, 'find', () => query([]));
  t.mock.method(AttendanceLog, 'find', () => query([]));
  t.mock.method(SupportTicket, 'countDocuments', async () => 0);
  t.mock.method(Placement, 'find', () => query([]));
  const start = new Date('2027-01-01');
  const end = new Date('2027-06-30');
  const first = await buildTermClosureData('School', start, end, 'Year 1');
  assert.equal(first.summary.totalLearners, 1);
  assert.equal(first.summary.academicGraduating, 1);
  assert.deepEqual(first.summary.programBreakdown, [{ program: 'Electrical', count: 1 }]);
  learner.year = 'Year 3';
  learner.academicStatus = 'Graduated';
  learner.program = 'Automotive';
  const refreshed = await buildTermClosureData('School', start, end, 'Year 1', first.cohortLearners);
  assert.equal(refreshed.summary.totalLearners, 1);
  assert.equal(refreshed.summary.academicGraduating, 1);
  assert.deepEqual(refreshed.summary.programBreakdown, [{ program: 'Electrical', count: 1 }]);
});

test('term closure includes visits in the matching WEL window after semester end', async t => {
  const learnerId = id();
  const termEnd = new Date('2027-02-28');
  const welVisit = new Date('2027-03-20');
  let visitFilter;
  t.mock.method(Learner, 'find', async () => [{ _id: learnerId, year: 'Year 3', academicStatus: 'Active', program: 'Electrical' }]);
  t.mock.method(Institution, 'findOne', () => ({ select() { return this; }, lean: async () => ({ calendarType: 'Single Track' }) }));
  t.mock.method(AcademicCalendar, 'find', filter => {
    assert.equal(filter.academicYear, '2026/2027');
    assert.equal(filter.semester, 'Semester 1');
    assert.equal(filter.targetYearGroup, 'Year 3');
    return query([{ title: 'Year 3 WEL', startDate: new Date('2027-03-15'), endDate: new Date('2027-05-30') }]);
  });
  t.mock.method(MonitoringVisit, 'find', filter => { visitFilter = filter; return query([{ learner: learnerId, visitDate: welVisit }]); });
  t.mock.method(CompetencyAssessment, 'find', () => query([]));
  t.mock.method(AttendanceLog, 'find', () => query([]));
  t.mock.method(SupportTicket, 'countDocuments', async () => 0);
  t.mock.method(Placement, 'find', () => query([{ learner: learnerId, startDate: new Date('2027-03-15') }]));
  const report = await buildTermClosureData('School', new Date('2026-09-01'), termEnd, 'Year 3', null, { academicYear: '2026/2027', semester: 'Semester 1' });
  assert.equal(report.summary.totalMonitoringVisits, 1);
  assert.equal(report.metrics.visitCoverage, 100);
  assert.equal(report.activityWindows.length, 2);
  assert.ok(visitFilter.$or.some(range => range.visitDate.$gte <= welVisit && range.visitDate.$lte >= welVisit));
});

test('rejection is limited to its review stage, and rejected reports require recertification', async t => {
  let saved = 0;
  const report = { status: 'HQ_Approved', institution: 'School', async save() { saved++; } };
  t.mock.method(SemesterReport, 'findOne', async () => report);
  const req = role => ({ user: { role, institution: 'School', _id: id() }, params: { id: String(id()) }, body: {} });
  let res = response();
  await route('reject')(req('HQManager'), res);
  assert.equal(res.code, 409);
  assert.equal(saved, 0);
  report.status = 'Rejected';
  res = response();
  await route('submit')(req('Admin'), res);
  assert.equal(res.code, 400);
  assert.equal(saved, 0);
});

test('HQ cannot approve an in-flight report whose saved WEL windows are stale', async t => {
  t.mock.method(SemesterReport, 'findOne', async () => ({
    status: 'Regional_Approved', institution: 'School', academicYear: '2026/2027', semester: 'Semester 1',
    yearGroup: 'Year 3', periodStart: new Date('2026-09-01'), periodEnd: new Date('2027-02-28'), activityWindows: [],
  }));
  t.mock.method(Institution, 'findOne', () => ({ select() { return this; }, lean: async () => ({ calendarType: 'Single Track' }) }));
  t.mock.method(AcademicCalendar, 'find', () => query([{ title: 'WEL', startDate: new Date('2027-03-15'), endDate: new Date('2027-05-30') }]));
  const res = response();
  await route('hq-approve')({ user: { role: 'HQManager' }, params: { id: String(id()) }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /Return this report/);
});

test('report writes detect a stale version before overwriting another decision', async t => {
  assert.equal(SemesterReport.schema.options.optimisticConcurrency, true);
  const report = new SemesterReport({ institution: 'School', semester: 'Semester 1', academicYear: '2026/2027', periodStart: '2026-09-01', periodEnd: '2026-09-29', generatedBy: id(), status: 'Draft' });
  report.$isNew = false;
  report.__v = 2;
  report.status = 'Certified';
  t.mock.method(SemesterReport.collection, 'updateOne', async filter => {
    assert.equal(filter.__v, 2);
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  });
  await assert.rejects(report.save(), { name: 'VersionError' });
});

test('certification waits until the complete reporting period has ended', async t => {
  const periodEnd = new Date(Date.now() + 86400000);
  const periodStart = new Date();
  const activityEnd = new Date(periodEnd);
  activityEnd.setUTCHours(23, 59, 59, 999);
  const report = { status: 'Draft', periodStart, periodEnd, activityWindows: [{ startDate: periodStart, endDate: activityEnd, label: 'Academic term' }] };
  t.mock.method(SemesterReport, 'findOne', async () => report);
  const res = response();
  await route('certify')({ user: { role: 'Admin', institution: 'School' }, params: { id: String(id()) }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /must end/);
});

test('certification waits for a matching WEL window that follows the term', async t => {
  const periodStart = new Date(Date.now() - 14 * 86400000);
  const periodEnd = new Date(Date.now() - 7 * 86400000);
  const termCutoff = new Date(periodEnd);
  termCutoff.setUTCHours(23, 59, 59, 999);
  const welStart = new Date(Date.now() - 2 * 86400000);
  const welEnd = new Date(Date.now() + 7 * 86400000);
  const welCutoff = new Date(welEnd);
  welCutoff.setUTCHours(23, 59, 59, 999);
  const report = {
    status: 'Draft', institution: 'School', academicYear: '2026/2027', semester: 'Semester 1', yearGroup: 'Year 3', periodStart, periodEnd,
    activityWindows: [
      { startDate: periodStart, endDate: termCutoff, label: 'Academic term' },
      { startDate: welStart, endDate: welCutoff, label: 'Year 3 WEL' },
    ],
  };
  t.mock.method(SemesterReport, 'findOne', async () => report);
  t.mock.method(Institution, 'findOne', () => ({ select() { return this; }, lean: async () => ({ calendarType: 'Single Track' }) }));
  t.mock.method(AcademicCalendar, 'find', () => query([{ title: 'Year 3 WEL', startDate: welStart, endDate: welEnd }]));
  const res = response();
  await route('certify')({ user: { role: 'Admin', institution: 'School' }, params: { id: String(id()) }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /WEL activity windows must end/);
});

test('legacy report can refresh into Draft and certify before submission', async t => {
  const report = new SemesterReport({ institution: 'School', semester: 'Semester 1', academicYear: '2026/2027', yearGroup: 'All', periodStart: '2026-09-01', periodEnd: '2026-09-29', generatedBy: id(), status: 'Generated' });
  t.mock.method(SemesterReport, 'findOne', async () => report);
  t.mock.method(SemesterReport, 'findById', () => ({ populate() { return this; }, then(resolve) { resolve(report); } }));
  t.mock.method(report, 'save', async () => report);
  t.mock.method(AuditLog, 'create', async () => ({}));
  t.mock.method(Learner, 'find', async () => []);
  t.mock.method(MonitoringVisit, 'find', () => query([]));
  t.mock.method(CompetencyAssessment, 'find', () => query([]));
  t.mock.method(AttendanceLog, 'find', () => query([]));
  t.mock.method(SupportTicket, 'countDocuments', async () => 0);
  t.mock.method(Placement, 'find', () => query([]));
  t.mock.method(Institution, 'findOne', () => ({ select() { return this; }, lean: async () => ({ calendarType: 'Single Track' }) }));
  t.mock.method(AcademicCalendar, 'find', () => query([]));
  const req = { user: { role: 'Admin', institution: 'School', _id: id() }, params: { id: String(report._id) }, body: { commentary: { challenges: 'None' } } };
  let res = response();
  await route('refresh-metrics')(req, res);
  assert.equal(res.code, 200);
  assert.equal(report.status, 'Draft');
  assert.ok(report.cohortCapturedAt);
  res = response();
  await route('certify')(req, res);
  assert.equal(res.code, 200);
  assert.equal(report.status, 'Certified');
  assert.equal(report.commentary.challenges, 'None');
  res = response();
  await route('refresh-metrics')(req, res);
  assert.equal(res.code, 200);
  assert.equal(report.status, 'Draft');
  assert.equal(report.certifiedBy, undefined);
});
