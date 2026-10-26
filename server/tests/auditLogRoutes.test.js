import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { AuditLog } from '../models/AuditLog.js';

const actor = { role: 'Admin', institution: 'Allowed College' };
const call = async (path, query) => {
  const response = {
    code: 200, headers: {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; },
    header(key, value) { this.headers[key] = value; return this; }, attachment() { return this; },
  };
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route;
  await route.stack.at(-1).handle({ user: actor, query }, response);
  return response;
};

test('list, totals and export use the same scoped investigation filters; options retain scope', async t => {
  const finds = [], counts = [], groups = [], facets = [];
  const event = { _id: 'audit', createdAt: '2026-10-26T12:00:00Z', action: 'AUTH', summary: 'Failed login', actorName: 'Officer', entityType: 'AuthSession', entityId: 'id', changedFields: [] };
  t.mock.method(AuditLog, 'find', query => {
    finds.push(query);
    return { sort() { return this; }, skip() { return this; }, limit: async () => [event] };
  });
  t.mock.method(AuditLog, 'countDocuments', async query => { counts.push(query); return 11; });
  t.mock.method(AuditLog, 'aggregate', async pipeline => { groups.push(pipeline); return []; });
  t.mock.method(AuditLog, 'distinct', async (key, query) => { facets.push(query); return ['AuthSession']; });
  const filters = { institution: 'Other College', actorName: 'Officer', actorId: '507f1f77bcf86cd799439011', action: 'AUTH', outcome: 'FAILED', dateFrom: '2026-10-01', dateTo: '2026-10-26', search: 'login' };
  const list = await call('/audit-logs', { ...filters, page: '2', pageSize: '10' });
  assert.equal(list.code, 200);
  assert.equal(list.body.total, 11);
  assert.equal(list.body.totalPages, 2);
  assert.deepEqual(counts[0], finds[0]);
  assert.deepEqual(groups[0][0].$match, finds[0]);
  assert.deepEqual(facets[0], { institution: 'Allowed College' });
  assert.deepEqual(groups[1][0].$match, { institution: 'Allowed College' });
  assert.equal(finds[0].$and[0].institution, 'Allowed College');
  assert.equal(finds[0].$and[1].institution, 'Other College');
  const exported = await call('/audit-logs/export', filters);
  assert.equal(exported.code, 200);
  assert.match(exported.body, /Failed login/);
  assert.deepEqual(finds[1], finds[0]);
});

test('invalid date ranges return a useful 400 on both list and export before querying logs', async t => {
  t.mock.method(AuditLog, 'find', () => { throw new Error('Must not query on invalid input'); });
  for (const path of ['/audit-logs', '/audit-logs/export']) {
    const result = await call(path, { dateFrom: '2026-10-27', dateTo: '2026-10-01' });
    assert.equal(result.code, 400);
    assert.match(result.body.message, /Start date/);
  }
});
