import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineReplay, supportsOfflineReplay } from '../utils/offlineReplay.js';
import { OfflineAction } from '../models/OfflineAction.js';

test('only field operations support automatic replay', () => {
  assert.equal(supportsOfflineReplay('/monitoring-visits', 'POST'), true);
  assert.equal(supportsOfflineReplay('/attendance-logs/507f1f77bcf86cd799439011', 'PUT'), true);
  for (const path of ['/learners/bulk-delete', '/users', '/placements', '/monitoring-visits/gps-review/bulk']) {
    assert.equal(supportsOfflineReplay(path, 'POST'), false);
  }
});

test('receipts prevent repeated writes, reject changed payloads and isolate accounts', async t => {
  const receipts = new Map();
  t.mock.method(OfflineAction, 'create', async doc => {
    if (receipts.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    receipts.set(doc._id, { ...doc, status: 'pending' });
  });
  t.mock.method(OfflineAction, 'findById', async id => receipts.get(id));
  t.mock.method(OfflineAction, 'updateOne', async ({ _id }, update) => Object.assign(receipts.get(_id), update.$set));
  let writes = 0;
  const request = (user = 'A', body = { learner: 'learner-A' }) => ({
    user: { _id: user, role: 'Staff', institution: 'QA' }, path: '/monitoring-visits', originalUrl: '/api/monitoring-visits', method: 'POST', body,
    get: () => 'd7cc8ae9-a49e-4eab-8311-4dacfc02281a',
  });
  const call = async (req, handler = res => { writes++; res.status(201).json({ _id: 'record', privateNotes: 'secret' }); }) => {
    let done;
    const result = new Promise(resolve => { done = resolve; });
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { done({ status: this.statusCode, body }); return this; } };
    await offlineReplay(req, res, () => handler(res));
    return result;
  };
  assert.equal((await call(request())).status, 201);
  const replay = await call(request());
  assert.equal(replay.status, 201);
  assert.equal(replay.body._id, 'record');
  assert.equal(replay.body.privateNotes, undefined);
  assert.equal(writes, 1);
  assert.equal((await call(request('A', { learner: 'other' }))).status, 409);
  assert.equal((await call(request('B'))).status, 201);
  assert.equal(writes, 2);
});

test('concurrent, crashed and partially failed operations require review rather than another write', async t => {
  let receipt;
  t.mock.method(OfflineAction, 'create', async doc => {
    if (receipt) throw Object.assign(new Error('duplicate'), { code: 11000 });
    receipt = { ...doc, status: 'pending' };
  });
  t.mock.method(OfflineAction, 'findById', async () => receipt);
  t.mock.method(OfflineAction, 'updateOne', async (filter, update) => Object.assign(receipt, update.$set));
  const req = { user: { _id: 'A', role: 'Staff' }, path: '/monitoring-visits', originalUrl: '/api/monitoring-visits', method: 'POST', body: {}, get: () => 'd7cc8ae9-a49e-4eab-8311-4dacfc02281a' };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await offlineReplay(req, res, () => {}); // Handler crashes before confirming its result.
  await offlineReplay(req, res, () => assert.fail('Must not repeat an uncertain write'));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'OFFLINE_RESULT_UNCERTAIN');
});
