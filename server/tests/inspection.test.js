import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { inspectionReadOnlyGuard, JWT_SECRET } from '../middleware/auth.js';
import { inspectionContext, isInspection } from '../utils/inspectionContext.js';
import { AcademicState } from '../models/AcademicState.js';
import { AcademicTerm } from '../models/AcademicTerm.js';
import { getAcademicState } from '../utils/academicGovernance.js';

test('inspection rejects even expired signed tokens on unsafe public routes; return is allowed', () => {
  const token = jwt.sign({ inspection: true, exp: 1 }, JWT_SECRET);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let status;
    inspectionReadOnlyGuard({ method, path: '/api/auth/reset-password/token', headers: { cookie: `gtvets_session=${token}` } }, { status(code) { status = code; return this; }, json() {} }, () => assert.fail('Mutation must not proceed'));
    assert.equal(status, 403);
  }
  let allowed = 0;
  for (const [method, path] of [['GET', '/api/learners'], ['POST', '/api/auth/inspection/stop']]) {
    inspectionReadOnlyGuard({ method, path, headers: { cookie: `gtvets_session=${token}` } }, {}, () => allowed++);
  }
  assert.equal(allowed, 2);
});

test('inspection context remains isolated between concurrent requests', async () => {
  const values = await Promise.all([
    inspectionContext.run(true, async () => { await Promise.resolve(); return isInspection(); }),
    (async () => { await Promise.resolve(); return isInspection(); })(),
  ]);
  assert.deepEqual(values, [true, false]);
});

test('academic-state fallback is read-only during inspection', async t => {
  t.mock.method(AcademicState, 'findById', () => ({ lean: async () => null }));
  t.mock.method(AcademicTerm, 'find', () => ({ sort() { return this; }, lean: async () => [{ _id: 'term', isCurrent: true }] }));
  t.mock.method(AcademicState, 'findOneAndUpdate', () => assert.fail('Inspection must not initialize persistent academic state'));
  const result = await inspectionContext.run(true, getAcademicState);
  assert.equal(result.currentTerm, 'term');
});
