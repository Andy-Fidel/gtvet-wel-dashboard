import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLogQuery } from '../utils/auditLogQuery.js';

// Institution and HQ scopes must survive every investigation filter.
test('investigation filters narrow caller scope without replacing it', () => {
  const scope = { $or: [{ institution: 'Allowed College' }, { region: 'Ashanti' }] };
  const query = auditLogQuery(scope, { institution: 'Other College', search: 'A.*', actorName: 'Someone', outcome: 'FAILED', action: 'AUTH' });
  assert.deepEqual(query.$and[0], scope);
  assert.equal(query.$and[1].institution, 'Other College');
  assert.equal(query.$and[1]['metadata.outcome'], 'FAILED');
  assert.equal(query.$and[1].actorName, 'Someone');
  assert.deepEqual(query.$and[1].$or[0], { summary: { $regex: 'A\\.\\*', $options: 'i' } });
});

test('search and entity IDs are literal substrings, including regex punctuation', () => {
  const filter = auditLogQuery({}, { search: '  a+b[0]  ', entityId: 'x.*' }).$and[1];
  const expression = new RegExp(filter.$or[0].summary.$regex, 'i');
  assert.equal(expression.test('A+B[0]'), true);
  assert.equal(expression.test('ab0'), false);
  assert.equal(filter.entityId.$regex, 'x\\.\\*');
});

test('UTC date filters include the whole end date and validate the range', () => {
  const query = auditLogQuery({}, { dateFrom: '2026-10-01', dateTo: '2026-10-26' }).$and[1];
  assert.equal(query.createdAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(query.createdAt.$lt.toISOString(), '2026-10-27T00:00:00.000Z');
  for (const params of [
    { dateFrom: '2026-10-27', dateTo: '2026-10-01' }, { dateTo: '2026-02-30' },
    { dateFrom: 'invalid' }, { dateTo: '2026-10-26T10:00:00Z' },
  ]) assert.throws(() => auditLogQuery({}, params), error => error.status === 400);
});

test('mass-update investigations include status changes; malformed filters are rejected', () => {
  assert.deepEqual(auditLogQuery({}, { action: 'UPDATES' }).$and[1].action, { $in: ['UPDATE', 'STATUS_CHANGE'] });
  for (const params of [{ institution: { $ne: '' } }, { actorId: ['a'] }, { search: 'a'.repeat(201) }, { outcome: 'ANYTHING' }, { action: 'INVALID' }]) {
    assert.throws(() => auditLogQuery({}, params), error => error.status === 400);
  }
});

test('actor IDs are cast for aggregation totals as well as list queries', () => {
  const actorId = '507f1f77bcf86cd799439011';
  const filter = auditLogQuery({}, { actorId }).$and[1];
  assert.equal(filter.actorId.toHexString(), actorId);
  assert.throws(() => auditLogQuery({}, { actorId: 'invalid' }), error => error.status === 400);
});
