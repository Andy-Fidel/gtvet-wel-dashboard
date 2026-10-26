import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { User } from '../models/User.js';
import { userRegistrySort } from '../utils/userRegistrySort.js';

test('directory sort only accepts known fields and directions with a stable unique tie-breaker', () => {
  assert.deepEqual(userRegistrySort(), { createdAt: -1, name: 1, _id: 1 });
  assert.deepEqual(userRegistrySort({ sortBy: 'name', sortDirection: 'asc' }), { name: 1, _id: 1 });
  assert.deepEqual(userRegistrySort({ sortBy: 'name', sortDirection: 'desc' }), { name: -1, _id: 1 });
  for (const input of [{ sortBy: '$where' }, { sortBy: 'password' }, { sortBy: { name: 1 } }, { sortDirection: 'anything' }]) {
    assert.throws(() => userRegistrySort(input), error => error.status === 400);
  }
});

test('registry applies sorting before pagination and keeps the authorization scope', async t => {
  const calls = [];
  let countFilter, findFilter;
  t.mock.method(User, 'countDocuments', async filter => { countFilter = filter; return 24; });
  t.mock.method(User, 'find', filter => {
    findFilter = filter;
    return { populate() { return this; }, sort(sort) { calls.push(['sort', sort]); return this; }, skip(skip) { calls.push(['skip', skip]); return this; }, limit: async limit => { calls.push(['limit', limit]); return []; } };
  });
  const handler = router.stack.find(layer => layer.route?.path === '/users/registry' && layer.route.methods.get).route.stack.at(-1).handle;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ user: { role: 'Admin', institution: 'QA College' }, query: { page: '2', pageSize: '12', sortBy: 'name', sortDirection: 'asc', q: 'Officer' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(calls, [['sort', { name: 1, _id: 1 }], ['skip', 12], ['limit', 12]]);
  assert.equal(findFilter.institution, 'QA College');
  assert.deepEqual(findFilter, countFilter);
  assert.equal(res.body.totalPages, 2);
  await handler({ user: { role: 'SuperAdmin' }, query: { sortBy: 'password' } }, res);
  assert.equal(res.code, 400);
});
