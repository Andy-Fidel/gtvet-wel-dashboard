import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { Institution } from '../models/Institution.js';
import { User } from '../models/User.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { AuditLog } from '../models/AuditLog.js';
import { AcademicCalendar } from '../models/AcademicCalendar.js';
const oid = () => new mongoose.Types.ObjectId();
const handler = path => router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('Mongo HQ workflow preserves complete scoped queues and exact exception destinations', { skip: process.env.HQ_ACTION_MONGO_INTEGRATION !== '1' }, async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27039/wel_hq_action_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const now = new Date();
    const past = days => new Date(now.getTime() - days * 86400000);
    const actor = { _id: oid(), role: 'SuperAdmin', name: 'QA HQ', status: 'Active' };
    await User.collection.insertOne({ ...actor, createdAt: now });
    await Institution.collection.insertMany([{ _id: oid(), name: 'School A', region: 'Ashanti', code: 'QA-A', calendarType: 'Single Track' }, { _id: oid(), name: 'School B', region: 'Ahafo', code: 'QA-B', calendarType: 'Transitional' }]);
    const reports = Array.from({ length: 14 }, (_, index) => ({ _id: oid(), institution: 'School A', semester: 'Semester 1', academicYear: '2026/2027', yearGroup: 'Year 1', periodStart: past(70), periodEnd: past(20), status: 'Regional_Approved', generatedBy: actor._id, hqReviewStartedAt: past(1), createdAt: past(80), updatedAt: now }));
    await SemesterReport.collection.insertMany(reports);
    const recentUrgentId = oid();
    await SupportTicket.collection.insertMany([
      ...Array.from({ length: 8 }, () => ({ _id: oid(), subject: 'Older low priority', description: 'Issue', requester: actor._id, requesterRole: 'SuperAdmin', institution: 'School A', priority: 'Low', status: 'Open', firstRespondedAt: past(1), resolutionDueAt: new Date(now.getTime() + 86400000), createdAt: past(30), updatedAt: past(20), replies: [] })),
      { _id: recentUrgentId, subject: 'Recent urgent response breach', description: 'Issue', requester: actor._id, requesterRole: 'SuperAdmin', institution: 'School A', priority: 'Urgent', status: 'Open', firstResponseDueAt: past(1), resolutionDueAt: new Date(now.getTime() + 86400000), createdAt: now, updatedAt: now, replies: [] },
      { _id: oid(), subject: 'Other institution issue', description: 'Issue', requester: actor._id, requesterRole: 'SuperAdmin', institution: 'School B', priority: 'High', status: 'Open', createdAt: now, updatedAt: now, replies: [] },
    ]);
    const learner = oid(), otherLearner = oid(), oldPlacement = oid(), activePlacement = oid();
    await Learner.collection.insertMany([
      { _id: learner, firstName: 'Ama', lastName: 'QA', trackingId: 'QA-A', institution: 'School A', region: 'Ashanti', status: 'Pending', academicStatus: 'Active', year: 'Year 1', program: 'Electrical', createdAt: past(50) },
      { _id: otherLearner, firstName: 'Other', lastName: 'QA', trackingId: 'QA-B', institution: 'School B', region: 'Ahafo', status: 'Pending', academicStatus: 'Active', year: 'Year 1', program: 'Electrical', createdAt: past(50) },
    ]);
    await Placement.collection.insertMany([
      { _id: oldPlacement, learner, institution: 'School A', status: 'Completed', companyName: 'Old host', startDate: past(80), endDate: past(40), createdAt: past(80) },
      { _id: activePlacement, learner, institution: 'School A', status: 'Active', companyName: 'Current host', supervisorName: 'QA Supervisor', supervisorPhone: '0000', startDate: past(20), endDate: new Date(now.getTime() + 86400000), createdAt: past(20) },
      { _id: oid(), learner: otherLearner, institution: 'School B', status: 'Active', companyName: 'Other host', startDate: past(20), createdAt: past(20) },
    ]);
    await MonitoringVisit.collection.insertOne({ _id: oid(), learner, placement: oldPlacement, institution: 'School A', visitDate: past(45), createdAt: past(45) });
    await AttendanceLog.collection.insertMany([{ _id: oid(), learner, placement: activePlacement, institution: 'School A', status: 'Pending', entryType: 'Weekly', periodStart: past(5), periodEnd: past(4), createdAt: past(4) }, { _id: oid(), learner: otherLearner, institution: 'School B', status: 'Pending', entryType: 'Weekly', periodStart: past(5), periodEnd: past(4), createdAt: past(4) }]);
    const deadlineId = oid();
    await AcademicCalendar.collection.insertMany([
      { _id: deadlineId, title: 'Past outstanding cycle', eventType: 'Deadline', isActive: true, semester: 'Semester 2', academicYear: '2025/2026', targetYearGroup: 'Year 1', institutionCalendarType: 'Single Track', startDate: past(40), endDate: past(10) },
      { _id: oid(), title: 'Next cycle', eventType: 'Deadline', isActive: true, semester: 'Semester 1', academicYear: '2026/2027', targetYearGroup: 'Year 1', institutionCalendarType: 'All', startDate: now, endDate: new Date(now.getTime() + 5 * 86400000) },
    ]);
    const call = async (path, query = {}, user = actor) => { const res = response(); await handler(path)({ user, query }, res); assert.equal(res.statusCode, 200, `${path}: ${res.body?.message}`); return res.body; };
    const overview = await call('/admin/overview', { refresh: 'true', actionCategory: 'Support' });
    assert.equal(overview.actionCentre.total, 10);
    assert.equal(overview.actionCentre.items[0].id, `support:${recentUrgentId}`);
    assert.equal(overview.approvalInbox.pendingCount, 14);
    assert.equal(overview.approvalInbox.overdueCount, 0, 'Old draft creation does not make a fresh review overdue');
    assert.equal(overview.dataQualityAlerts.placementsMissingSupervisor, 1, 'Name and phone suffice for supervisor contact');
    assert.equal(overview.dataQualityAlerts.activePlacementsWithoutVisits, 2, 'A historical visit cannot satisfy a new placement');
    assert.equal(overview.deadlineRisk.overdueInstitutionSubmissions.length, 1);
    assert.equal(overview.deadlineRisk.overdueInstitutionSubmissions[0].institution, 'School A');
    const page2 = await call('/admin/overview', { actionCategory: 'Reports', actionPage: '2' });
    assert.equal(page2.actionCentre.total, 14);
    assert.equal(page2.actionCentre.items.length, 4);
    const scoped = { ...actor, role: 'HQStaff', hqScopeType: 'Institution', institution: 'School A', region: 'Ashanti' };
    const scopedOverview = await call('/admin/overview', { refresh: 'true', actionCategory: 'Support' }, scoped);
    assert.equal(scopedOverview.actionCentre.total, 9);
    assert.ok(scopedOverview.actionCentre.items.every(item => item.institution === 'School A'));
    const denied = response();
    await handler('/learners')({ user: scoped, query: { exception: 'stale-pending', institution: 'School B', page: '1' } }, denied);
    assert.equal(denied.statusCode, 403, 'Attempt to override scope is rejected');
    const placements = await call('/placements', { exception: 'missing-supervisor', page: '1' }, scoped);
    assert.equal(placements.items.length, 0);
    const due = await call('/monitoring-visits/due', { exception: 'unvisited-placement' }, scoped);
    assert.deepEqual(due.items.map(item => String(item.placementId)), [String(activePlacement)]);
    const logs = await call('/attendance-logs', { exception: 'unsigned-overdue' }, scoped);
    assert.equal(logs.length, 1);
    const missingReports = await call('/semester-reports', { institution: 'School A', semester: 'Semester 2', academicYear: '2025/2026', yearGroup: 'Year 1', deadlineView: 'overdue', deadlineId: String(deadlineId), page: '1' }, scoped);
    assert.equal(missingReports.items.length, 0);
    assert.equal(missingReports.cycleReportCount, 0);
    const matchingReports = await call('/semester-reports', { institution: 'School A', semester: 'Semester 1', academicYear: '2026/2027', yearGroup: 'Year 1', page: '1' }, scoped);
    assert.equal(matchingReports.total, 14);
    // Reminder outcomes reflect actual writes, including deduplication; no external channels enabled.
    await User.collection.insertOne({ _id: oid(), name: 'QA institution admin', role: 'Admin', status: 'Active', institution: 'School A', notificationPreferences: { inApp: true, push: false, whatsApp: false } });
    const notify = async (user = actor) => {
      const res = response();
      const route = router.stack.find(layer => layer.route?.path === '/admin/deadline-risk/notify').route.stack.at(-1).handle;
      await route({ user, body: { institution: 'School A', riskType: 'overdue', semester: 'Semester 2', academicYear: '2025/2026', deadlineId: String(deadlineId) } }, res);
      return res;
    };
    const reminder = await notify();
    assert.equal(reminder.statusCode, 200);
    assert.equal(reminder.body.notifiedCount, 1);
    const repeated = await notify();
    assert.equal(repeated.body.notifiedCount, 0);
    assert.equal(repeated.body.skippedCount, 1);
    assert.equal(await AuditLog.countDocuments({ entityType: 'Institution', 'metadata.deadlineId': String(deadlineId) }), 2, 'Both reminder outcomes have valid audit records');
    assert.equal((await notify({ ...actor, role: 'RegionalAdmin', region: 'Ahafo' })).statusCode, 403);
    await SemesterReport.collection.insertOne({ institution: 'School A', semester: 'Semester 2', academicYear: '2025/2026', yearGroup: 'Year 1', status: 'Submitted' });
    assert.equal((await notify()).statusCode, 409, 'Resolved deadline risk cannot generate a reminder');
    const clearedRisk = await call('/semester-reports', { institution: 'School A', semester: 'Semester 2', academicYear: '2025/2026', yearGroup: 'Year 1', deadlineView: 'overdue', deadlineId: String(deadlineId), page: '1' }, scoped);
    assert.equal(clearedRisk.deadlineRiskActive, false);
    assert.equal(clearedRisk.items.length, 0);
    assert.equal(clearedRisk.cycleReportCount, 1);

    // New lifecycle writes record real stage entry timestamps without a history backfill.
    const periodEnd = new Date(reports[0].periodEnd); periodEnd.setUTCHours(23, 59, 59, 999);
    await SemesterReport.collection.updateOne({ _id: reports[0]._id }, { $set: { status: 'Certified', activityWindows: [{ startDate: reports[0].periodStart, endDate: periodEnd, label: 'Academic term' }] } });
    const mutate = async (action, user) => {
      const res = response();
      const route = router.stack.find(layer => layer.route?.path === `/semester-reports/:id/${action}`).route.stack.at(-1).handle;
      await route({ user, params: { id: String(reports[0]._id) }, body: {} }, res);
      return res;
    };
    assert.equal((await mutate('submit', { ...actor, role: 'Admin', institution: 'School A' })).statusCode, 200);
    const submitted = await SemesterReport.findById(reports[0]._id).lean();
    assert.ok(submitted.submittedAt >= now);
    assert.equal(submitted.hqReviewStartedAt, undefined);
    assert.equal((await mutate('regional-approve', { ...actor, role: 'RegionalAdmin', region: 'Ashanti' })).statusCode, 200);
    const approved = await SemesterReport.findById(reports[0]._id).lean();
    assert.ok(approved.hqReviewStartedAt >= submitted.submittedAt);

    console.log(JSON.stringify({ verified: 'complete queue, scoped filters, deadline cycles, stage age, current-placement monitoring and supervisor contact' }));
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
