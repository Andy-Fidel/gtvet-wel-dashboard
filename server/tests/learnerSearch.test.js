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
