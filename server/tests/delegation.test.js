import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { Placement } from '../models/Placement.js';

async function call(path, method, role = 'Admin', body = {}) {
  const handler = router.stack.find(x => x.route?.path === path && x.route.methods[method]).route.stack.at(-1).handle;
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'placement' }, user: { _id: 'delegate', institution: 'Receiving', role }, body }, res);
  return res;
}

test('delegate cannot delete another institution placement', async t => {
  t.mock.method(Placement, 'findOneAndDelete', async query => {
    assert.deepEqual(query, { _id: 'placement', institution: 'Receiving' });
    return null;
  });
  await call('/placements/:id', 'delete');
  assert.equal((await call('/placements/:id', 'delete', 'Staff')).statusCode, 403);
});

test('delegate management only searches the originating institution', async t => {
  t.mock.method(Placement, 'findOne', query => {
    assert.deepEqual(query, { _id: 'placement', institution: 'Receiving' });
    return { populate() { return this; }, then(resolve) { resolve(null); } };
  });
  assert.equal((await call('/placements/:id/delegate', 'put')).statusCode, 404);
});

test('closed placements reject new delegation', async t => {
  t.mock.method(Placement, 'findOne', () => ({ populate() { return this; }, then(resolve) { resolve({ status: 'Completed', toObject: () => ({}) }); } }));
  assert.equal((await call('/placements/:id/delegate', 'put', 'Admin', { delegateId: 'next' })).statusCode, 400);
});

test('limited learner endpoint requires exact active assignment', async t => {
  t.mock.method(Placement, 'findOne', query => {
    assert.deepEqual(query, { _id: 'placement', delegate: 'delegate', status: 'Active' });
    return { select() { return this; }, populate: async () => null };
  });
  assert.equal((await call('/placements/:id/delegated-learner', 'get', 'Staff')).statusCode, 404);
});
