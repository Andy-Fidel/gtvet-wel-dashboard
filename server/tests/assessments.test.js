import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { CompetencyAssessment } from '../models/CompetencyAssessment.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { assessmentInput, serializeAssessment, validateAssessmentInput } from '../utils/assessmentAccess.js';

const id = '507f1f77bcf86cd799439011';
const valid = { learner: id, institution: 'Home', assessmentType: 'Practical', assessmentDate: '2026-09-01', technicalSkills: 'Technical skills', softSkills: 'Communication', professionalism: 3, problemSolving: 3, overallScore: 0, assessorName: 'QA Tester' };
const chain = value => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value, then(resolve) { return Promise.resolve(value).then(resolve); } });
async function call(method, { path = '/assessments', role = 'Admin', body = {}, query = {}, user = {} } = {}) {
  const route = router.stack.find(x => x.route?.path === path && x.route.methods[method]).route;
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, type() { return this; }, attachment() { return this; }, send(body) { this.body = body; return this; } };
  await route.stack.at(-1).handle({ user: { _id: id, role, institution: 'Home', ...user }, params: { id }, body, query }, res);
  return res;
}

test('names serialize from real fields and missing learners are safe', () => {
  assert.equal(serializeAssessment({ learner: { lastName: 'Mensah', firstName: 'Ama', middleName: 'Akua' } }).learner.name, 'Mensah Akua Ama');
  assert.equal(serializeAssessment({ learner: null, trackingId: 'QA-1' }).trackingId, 'QA-1');
  assert.equal(serializeAssessment({ learner: { trackingId: 'QA-2' } }).learner.name, 'QA-2');
});

test('read and mutation roles fail closed, including institution-less staff', async () => {
  for (const role of ['Partner', 'Guardian', 'Learner', 'Unknown']) {
    assert.equal((await call('get', { role })).statusCode, 403);
    assert.equal((await call('get', { role, path: '/assessments/export' })).statusCode, 403);
  }
  for (const role of ['SuperAdmin', 'RegionalAdmin', 'HQManager', 'HQStaff', 'Partner', 'Guardian']) {
    for (const method of ['post', 'put', 'delete']) {
      assert.equal((await call(method, { role, path: method === 'post' ? '/assessments' : '/assessments/:id' })).statusCode, 403);
    }
  }
  assert.equal((await call('post', { user: { institution: '' } })).statusCode, 403);
  assert.equal((await call('delete', { role: 'Staff', path: '/assessments/:id' })).statusCode, 403);
});

test('create requires a learner in the submitting institution', async t => {
  t.mock.method(Learner, 'findOne', query => {
    assert.deepEqual(query, { _id: id, institution: 'Home' });
    return chain(null);
  });
  t.mock.method(CompetencyAssessment.prototype, 'save', () => assert.fail('must not save'));
  assert.equal((await call('post', { body: valid })).statusCode, 404);
  assert.equal((await call('post', { body: { ...valid, learner: 'invalid' } })).statusCode, 400);
});

test('create derives identity, preserves zero scores and never completes learner', async t => {
  const learner = new Learner({ _id: id, firstName: 'Ama', lastName: 'Mensah', trackingId: 'REAL-ID', institution: 'Home', status: 'Placed' });
  t.mock.method(Learner, 'findOne', () => chain(learner));
  t.mock.method(Learner, 'findByIdAndUpdate', () => assert.fail('must not change learner status'));
  t.mock.method(CompetencyAssessment.prototype, 'save', async function () {
    assert.equal(this.institution, 'Home');
    assert.equal(this.trackingId, 'REAL-ID');
    assert.equal(this.overallScore, 0);
    await this.validate();
    return this;
  });
  t.mock.method(AuditLog, 'create', async () => ({}));
  t.mock.method(User, 'find', () => chain([]));
  const response = await call('post', { body: { ...valid, institution: 'Other', trackingId: 'FORGED', status: 'Completed' } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.learner.name, 'Mensah Ama');
  assert.equal(response.body.learner.institution, 'Home');
});

test('schema rejects invalid scores, fractional ratings, short skills and invalid types', async () => {
  for (const patch of [{ overallScore: -1 }, { overallScore: 101 }, { professionalism: 1.5 }, { problemSolving: 6 }, { technicalSkills: ' ' }, { assessmentType: 'Invalid' }]) {
    await assert.rejects(new CompetencyAssessment({ ...valid, ...patch }).validate());
  }
  await new CompetencyAssessment({ ...valid, assessmentType: 'Oral' }).validate();
  assert.ok(validateAssessmentInput({ overallScore: '100' }));
  assert.ok(validateAssessmentInput({ assessmentDate: '' }));
  assert.deepEqual(assessmentInput({ overallScore: 20, institution: 'Other', $set: { institution: 'Other' }, learner: id }), { overallScore: 20 });
});

test('update prevents reassignment and scopes assessment and learner checks', async t => {
  t.mock.method(CompetencyAssessment, 'findOne', query => {
    assert.deepEqual(query, { _id: id, institution: 'Home' });
    return new CompetencyAssessment({ ...valid, _id: id });
  });
  assert.equal((await call('put', { path: '/assessments/:id', body: { institution: 'Other' } })).statusCode, 400);
  assert.equal((await call('put', { path: '/assessments/:id', body: { learner: '507f1f77bcf86cd799439012' } })).statusCode, 400);
  t.mock.method(Learner, 'findOne', query => {
    assert.deepEqual(query, { _id: new CompetencyAssessment(valid).learner, institution: 'Home' });
    return chain(null);
  });
  assert.equal((await call('put', { path: '/assessments/:id', body: { overallScore: 50 } })).statusCode, 404);
});

test('updates use allowlisted fields and run validators', async t => {
  t.mock.method(CompetencyAssessment, 'findOne', async () => new CompetencyAssessment({ ...valid, _id: id }));
  t.mock.method(Learner, 'findOne', () => chain({ _id: id, firstName: 'Ama', lastName: 'Mensah' }));
  t.mock.method(CompetencyAssessment, 'findOneAndUpdate', async (query, update, options) => {
    assert.deepEqual(query, { _id: id, institution: 'Home' });
    assert.deepEqual(update, { $set: { overallScore: 50 } });
    assert.equal(options.runValidators, true);
    return new CompetencyAssessment({ ...valid, overallScore: 50 });
  });
  t.mock.method(AuditLog, 'create', async () => ({}));
  assert.equal((await call('put', { path: '/assessments/:id', body: { overallScore: 50, $set: { institution: 'Other' } } })).statusCode, 200);
});

test('list populates actual name fields, paginated and unpaginated', async t => {
  t.mock.method(CompetencyAssessment, 'find', filter => {
    assert.equal(filter.institution, 'Home');
    return { ...chain([{ ...valid, learner: { firstName: 'Ama', lastName: 'Mensah' } }, { ...valid, learner: null }]), populate(path, fields) {
      assert.equal(path, 'learner');
      assert.ok(fields.includes('firstName'));
      assert.ok(fields.includes('lastName'));
      return this;
    } };
  });
  t.mock.method(CompetencyAssessment, 'countDocuments', async () => 2);
  t.mock.method(CompetencyAssessment, 'aggregate', async () => []);
  assert.equal((await call('get')).body[0].learner.name, 'Mensah Ama');
  const paginated = await call('get', { query: { page: '1' } });
  assert.equal(paginated.body.items[0].learner.name, 'Mensah Ama');
  assert.equal(paginated.body.items[1].learner, null);
});

test('export shares filters, escapes search and neutralizes formula cells', async t => {
  t.mock.method(Learner, 'find', filter => {
    assert.equal(filter.institution, 'Home');
    assert.equal(filter.$or[0].trackingId.source, '\\[');
    return chain([{ _id: id }]);
  });
  t.mock.method(CompetencyAssessment, 'find', filter => {
    assert.deepEqual(filter, { institution: 'Home', learner: { $in: [id] }, assessmentType: 'Practical', overallScore: { $lt: 40 } });
    return chain([{ ...valid, learner: { firstName: '=SUM(1,2)' }, assessorName: '+formula' }]);
  });
  const res = await call('get', { path: '/assessments/export', query: { search: '[', assessmentType: 'Practical', scoreBand: 'low' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes("'=SUM(1,2)"));
  assert.ok(res.body.includes("'+formula"));
});

test('HQ and region read/export retain their institution scope, including empty CSV', async t => {
  t.mock.method(Institution, 'find', () => chain([{ name: 'Home' }]));
  t.mock.method(CompetencyAssessment, 'find', filter => {
    assert.deepEqual(filter.institution, { $in: ['Home'] });
    return chain([]);
  });
  for (const role of ['RegionalAdmin', 'HQManager', 'HQStaff']) {
    const user = { region: 'Accra', hqScopeType: 'Region' };
    assert.equal((await call('get', { role, user })).statusCode, 200);
    const exported = await call('get', { role, user, path: '/assessments/export' });
    assert.equal(exported.statusCode, 200);
    assert.ok(exported.body.includes('Learner'));
  }
});
