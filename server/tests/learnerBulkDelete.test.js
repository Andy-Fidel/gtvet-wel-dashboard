import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { AuditLog } from '../models/AuditLog.js';
import { validateBulkLearnerIds } from '../utils/learnerDeletion.js';
import { mockUserManagementLock } from './helpers/userManagementLock.js';
beforeEach(mockUserManagementLock);
const one = '507f1f77bcf86cd799439011', two = '507f1f77bcf86cd799439012', absent = '507f1f77bcf86cd799439013';
const handler = router.stack.find(layer => layer.route?.path === '/learners/bulk-delete').route.stack.at(-1).handle;
const call = async (learnerIds, user = { role: 'Admin', institution: 'QA' }) => {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ user, body: { learnerIds }, headers: {} }, res);
  return res;
};

test('bulk learner IDs reject empty, oversized, malformed and duplicated selections', () => {
  for (const value of [undefined, [], [one, 'bad'], Array(101).fill(one), [one, one], [one, one.toUpperCase()]]) assert.ok(validateBulkLearnerIds(value));
  assert.equal(validateBulkLearnerIds([one, two]), null);
});

test('oversight, partner and guardian roles cannot bulk delete, even with an institution', async t => {
  t.mock.method(Learner, 'find', () => { throw new Error('Unauthorized database access'); });
  for (const role of ['RegionalAdmin', 'HQManager', 'HQStaff', 'IndustryPartner', 'Guardian']) assert.equal((await call([one], { role, institution: 'QA' })).code, 403);
  assert.equal((await call([one], { role: 'Admin' })).code, 403);
  assert.equal((await call([])).code, 400);
});

test('bulk deletion stays institution scoped, retains linked records, and audits only successful deletions', async t => {
  const deleted = [], audits = [];
  t.mock.method(Learner, 'find', filter => {
    assert.deepEqual(filter, { _id: { $in: [one, two, absent] }, institution: 'QA' });
    return { lean: async () => [{ _id: one, lastName: 'Free', firstName: 'Learner', workflowVersion: 2 }, { _id: two, lastName: 'Linked', firstName: 'Learner' }] };
  });
  for (const name of ['Placement', 'PlacementTransfer', 'PlacementRequest', 'MonitoringVisit', 'CompetencyAssessment', 'EmployerEvaluation', 'AttendanceLog', 'GuardianConsent', 'PlacementAgreement', 'Document', 'SupportTicket', 'User', 'SemesterReport']) {
    t.mock.method(mongoose.model(name), 'distinct', async () => name === 'Placement' ? [two] : []);
  }
  t.mock.method(Learner, 'deleteOne', async filter => { deleted.push(filter); return { deletedCount: 1 }; });
  t.mock.method(AuditLog, 'create', async event => { audits.push(event); return {}; });
  const result = await call([one, two, absent]);
  assert.equal(result.code, 200);
  assert.equal(result.body.deletedCount, 1);
  assert.deepEqual(result.body.deletedIds, [one]);
  assert.equal(result.body.skipped.length, 2);
  assert.match(result.body.skipped[0].reason, /must be retained/);
  assert.equal(result.body.skipped[1].name, undefined);
  assert.deepEqual(deleted, [{ _id: one, institution: 'QA', workflowVersion: 2 }]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.bulkDelete, true);
});

test('a changed learner is kept rather than reported as deleted', async t => {
  t.mock.method(Learner, 'find', () => ({ lean: async () => [{ _id: one }] }));
  for (const name of ['Placement', 'PlacementTransfer', 'PlacementRequest', 'MonitoringVisit', 'CompetencyAssessment', 'EmployerEvaluation', 'AttendanceLog', 'GuardianConsent', 'PlacementAgreement', 'Document', 'SupportTicket', 'User', 'SemesterReport']) t.mock.method(mongoose.model(name), 'distinct', async () => []);
  t.mock.method(Learner, 'deleteOne', async () => ({ deletedCount: 0 }));
  const result = await call([one]);
  assert.equal(result.body.deletedCount, 0);
  assert.match(result.body.skipped[0].reason, /changed/);
});
