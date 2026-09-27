import test from 'node:test';
import assert from 'node:assert/strict';
import router, { delegationChangesForRegion } from '../routes/api.js';
import { Placement } from '../models/Placement.js';
import { Institution } from '../models/Institution.js';
import { User } from '../models/User.js';

const placementId = '507f1f77bcf86cd799439011';

async function call(path, method, role = 'Admin', body = {}, id = 'placement') {
  const handler = router.stack.find(x => x.route?.path === path && x.route.methods[method]).route.stack.at(-1).handle;
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id }, user: { _id: 'delegate', institution: 'Receiving', role }, body }, res);
  return res;
}

test('delegate cannot delete another institution placement', async t => {
  t.mock.method(Placement, 'findOne', async query => {
    assert.deepEqual(query, { _id: 'placement', institution: 'Receiving' });
    return null;
  });
  assert.equal((await call('/placements/:id', 'delete')).statusCode, 404);
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
  t.mock.method(Placement, 'findOne', () => ({ populate() { return this; }, then(resolve) { resolve({ status: 'Completed', workflowVersion: 0, toObject: () => ({}) }); } }));
  const response = await call('/placements/:id/delegate', 'put', 'Admin', { delegateId: placementId, sourceVersion: 0 });
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Only active placements/);
});

test('stale delegation updates are rejected before writing', async t => {
  t.mock.method(Placement, 'findOne', () => ({ populate() { return this; }, then(resolve) {
    resolve({ _id: placementId, status: 'Active', workflowVersion: 4, toObject: () => ({ workflowVersion: 4 }) });
  } }));
  t.mock.method(Placement, 'findOneAndUpdate', () => assert.fail('stale delegation must not write'));
  const response = await call('/placements/:id/delegate', 'put', 'Admin', { delegateId: null, sourceVersion: 3 }, placementId);
  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /Placement changed/);
});

test('delegate candidates require an owned placement and match region aliases', async t => {
  t.mock.method(Placement, 'findOne', query => {
    assert.deepEqual(query, { _id: placementId, institution: 'Receiving' });
    return { select: async () => ({ status: 'Active', placementRegion: 'G. Accra' }) };
  });
  t.mock.method(Institution, 'find', query => {
    assert.equal(query.region.test('Greater Accra Region'), true);
    assert.equal(query.region.test('Ashanti'), false);
    return { select() { return this; }, lean: async () => [{ name: 'Accra Technical Institute' }] };
  });
  t.mock.method(User, 'find', query => {
    assert.deepEqual(query.institution, { $in: ['Accra Technical Institute'] });
    assert.deepEqual(query.role, { $in: ['Admin', 'Manager', 'Staff'] });
    return { select() { return this; }, sort: async () => [{ _id: 'candidate', name: 'Candidate' }] };
  });
  const response = await call('/placements/:id/delegate-candidates', 'get', 'Manager', {}, placementId);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body[0].name, 'Candidate');
});

test('delegate candidate directory is unavailable to staff', async () => {
  const response = await call('/placements/:id/delegate-candidates', 'get', 'Staff', {}, placementId);
  assert.equal(response.statusCode, 403);
});

test('changing to a region where the delegate is ineligible clears the delegation', async t => {
  t.mock.method(Institution, 'find', () => ({ select() { return this; }, lean: async () => [] }));
  const changes = await delegationChangesForRegion({
    placementRegion: 'Ashanti',
    delegate: placementId,
    delegatedAt: new Date(),
    delegatedBy: 'manager',
    delegateInstitution: 'Kumasi Technical Institute',
  }, 'Volta');
  assert.deepEqual(changes, { delegate: null, delegatedAt: null, delegatedBy: null, delegateInstitution: '' });
});

test('limited learner endpoint requires exact active assignment', async t => {
  t.mock.method(Placement, 'findOne', query => {
    assert.deepEqual(query, { _id: 'placement', delegate: 'delegate', status: 'Active' });
    return { select() { return this; }, populate: async () => null };
  });
  assert.equal((await call('/placements/:id/delegated-learner', 'get', 'Staff')).statusCode, 404);
});
