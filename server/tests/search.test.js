import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { learnerSearchFilter } from '../utils/learnerSearch.js';

const handler = router.stack.find(layer => layer.route?.path === '/search' && layer.route.methods.get).route.stack.at(-1).handle;

test('learner search matches name words in any order and escapes regex characters', () => {
  const filter = learnerSearchFilter('  Ama   Mensah  ');
  const words = filter.$or.at(-1).$and;
  assert.equal(words.length, 2);
  assert.ok(words[0].$or[0].firstName.test('AMA'));
  assert.ok(words[1].$or[2].lastName.test('Mensah'));
  const id = learnerSearchFilter('ID[12].').$or[0].trackingId;
  assert.ok(id.test('ID[12].'));
  assert.equal(id.test('ID1x'), false);
});

test('institution navbar search is scoped for Admin, Manager and Staff and returns real names', async t => {
  t.mock.method(Placement, 'find', () => assert.fail('Institution search must not query placements'));
  t.mock.method(Learner, 'find', filter => {
    assert.deepEqual(filter.$and[0], { institution: 'Accra Institute' });
    assert.deepEqual(filter.$and[1], learnerSearchFilter('Ama Mensah'));
    return {
      sort() { return this; },
      limit(value) { assert.equal(value, 5); return this; },
      select(fields) { assert.ok(fields.includes('firstName')); return this; },
      lean: async () => [{ _id: 'learner1', firstName: 'Ama', lastName: 'Mensah', trackingId: 'WEL001' }],
    };
  });
  for (const role of ['Admin', 'Manager', 'Staff']) {
    await handler({ user: { role, institution: 'Accra Institute' }, query: { q: 'Ama Mensah' } }, {
      status(code) { assert.fail(`Unexpected status ${code}`); },
      json(data) {
        assert.equal(data.learners[0].name, 'Mensah Ama');
        assert.deepEqual(data.placements, []);
        assert.deepEqual(data.institutions, []);
      },
    });
  }
});

test('search rejects missing scope and unsupported roles, and bounds queries without database access', async t => {
  t.mock.method(Learner, 'find', () => assert.fail('Must not query learners'));
  for (const [user, q, expected] of [
    [{ role: 'Staff' }, 'Ama', 403],
    [{ role: 'Learner' }, 'Ama', 403],
    [{ role: 'Admin', institution: 'Accra Institute' }, 'a'.repeat(101), 400],
    [{ role: 'Manager', institution: 'Accra Institute' }, ' a ', 200],
  ]) {
    let status = 200;
    await handler({ user, query: { q } }, {
      status(code) { status = code; return this; },
      json(data) { if (expected === 200) assert.deepEqual(data, { learners: [], placements: [], institutions: [] }); },
    });
    assert.equal(status, expected);
  }
});
