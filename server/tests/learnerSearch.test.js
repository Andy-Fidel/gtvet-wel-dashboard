import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { Document } from '../models/Document.js';
import { inspectionContext } from '../utils/inspectionContext.js';

test('paginated learner search uses valid matching filters for intake options', async t => {
  let learnerFilter;
  t.mock.method(Learner, 'find', filter => {
    learnerFilter = filter;
    const chain = { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, async lean() { return []; } };
    return chain;
  });
  t.mock.method(Document, 'find', () => ({ select: async () => [] }));
  t.mock.method(Learner, 'countDocuments', async () => 0);
  t.mock.method(Learner, 'aggregate', async () => []);
  t.mock.method(Learner, 'distinct', async (field, filter) => {
    if (field === 'intakeAcademicYear') {
      assert.equal(Object.hasOwn(filter, '$or'), false);
      assert.deepEqual(filter.$and, learnerFilter.$and);
      assert.equal(filter.institution, 'Pilot');
    }
    return [];
  });
  const handler = router.stack.find(layer => layer.route?.path === '/learners' && layer.route.methods.get).route.stack[0].handle;
  for (const search of ['Ama Mensah', 'WEL-001', '[', '   ', '']) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await inspectionContext.run(true, () => handler({ user: { role: 'Admin', institution: 'Pilot' }, query: { search, page: '1', pageSize: '25' } }, res));
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.items, []);
  }
});

test('HQ school filtering applies before pagination and cannot replace institution scope', async t => {
  let learnerFilter;
  t.mock.method(Learner, 'find', filter => {
    learnerFilter = filter;
    return { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, async lean() { return []; } };
  });
  t.mock.method(Document, 'find', () => ({ select: async () => [] }));
  t.mock.method(Learner, 'countDocuments', async filter => { assert.deepEqual(filter, learnerFilter); return 0; });
  t.mock.method(Learner, 'aggregate', async pipeline => { assert.deepEqual(pipeline[0].$match, learnerFilter); return []; });
  t.mock.method(Learner, 'distinct', async (field, filter) => {
    if (field === 'institution') {
      assert.equal(filter.institution, undefined);
      return ['School B', 'School A'];
    }
    return [];
  });
  const handler = router.stack.find(layer => layer.route?.path === '/learners' && layer.route.methods.get).route.stack[0].handle;
  for (const role of ['SuperAdmin', 'HQManager', 'HQStaff']) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await inspectionContext.run(true, () => handler({ user: { role, hqScopeType: 'National' }, query: { institution: 'School A', search: 'Ama', page: '1', pageSize: '25' } }, res));
    assert.equal(res.code, 200);
    assert.equal(learnerFilter.institution, 'School A');
    assert.ok(learnerFilter.$and);
    assert.deepEqual(res.body.institutionOptions, ['School A', 'School B']);
  }
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await inspectionContext.run(true, () => handler({ user: { role: 'HQStaff', hqScopeType: 'Institution', institution: 'School A' }, query: { institution: 'School B', page: '1' } }, res));
  assert.equal(res.code, 403);
});

test('all-record learner export omits pagination and retains the authorized school scope', async t => {
  let learnerFilter;
  const items = Array.from({ length: 40 }, (_, index) => ({ _id: String(index), name: `Learner ${index}` }));
  t.mock.method(Learner, 'find', filter => {
    learnerFilter = filter;
    return { select() { return this; }, sort() { return this; }, skip() { assert.fail('Export must not skip rows'); }, limit() { assert.fail('Export must not limit rows'); }, async lean() { return items; } };
  });
  t.mock.method(Document, 'find', () => ({ select: async () => [] }));
  const { Placement } = await import('../models/Placement.js');
  t.mock.method(Placement, 'find', () => ({ select: async () => [] }));
  const handler = router.stack.find(layer => layer.route?.path === '/learners' && layer.route.methods.get).route.stack[0].handle;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await inspectionContext.run(true, () => handler({ user: { role: 'HQStaff', hqScopeType: 'Institution', institution: 'School A' }, query: { search: 'Learner', program: 'Electrical' } }, res));
  assert.equal(res.code, 200);
  assert.equal(res.body.length, 40);
  assert.equal(learnerFilter.institution, 'School A');
  assert.equal(learnerFilter.program, 'Electrical');
  assert.ok(learnerFilter.$and);
});
