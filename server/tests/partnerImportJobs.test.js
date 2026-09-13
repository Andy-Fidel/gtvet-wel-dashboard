import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { PartnerImport } from '../models/PartnerImport.js';
import { AuditLog } from '../models/AuditLog.js';
import { startPartnerImport, advancePartnerImport, importSummary } from '../utils/partnerImportJobs.js';
import router from '../routes/api.js';

const jobFixture = (count = 1) => ({ _id: new mongoose.Types.ObjectId(), addedBy: new mongoose.Types.ObjectId(), rows: Array.from({ length: count }, (_, i) => ({ row: i + 2, name: `Partner ${i}`, data: { name: `Partner ${i}`, sector: 'IT', region: 'Ashanti' }, partnerId: new mongoose.Types.ObjectId(), status: 'Ready' })) });
function checkpoints(t, job) {
  t.mock.method(PartnerImport, 'findById', async () => job);
  t.mock.method(PartnerImport, 'updateOne', async (filter, update) => {
    const row = job.rows.find(row => row.row === filter.rows.$elemMatch.row && row.status === 'Ready');
    if (!row) return { modifiedCount: 0 };
    row.status = update.$set['rows.$.status'];
    row.message = update.$set['rows.$.message'];
    return { modifiedCount: 1 };
  });
  t.mock.method(AuditLog, 'create', async () => ({}));
}

test('same file and actor reuse a persisted batch without overwriting checkpoints', async t => {
  const saved = new Map();
  t.mock.method(PartnerImport, 'findOneAndUpdate', async (filter, update, options) => {
    assert.equal(options.upsert, true);
    if (!saved.has(filter._id)) saved.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
    return saved.get(filter._id);
  });
  const user = { _id: 'user1' };
  const first = await startPartnerImport('csv', user, [{ status: 'Created' }]);
  const retry = await startPartnerImport('csv', user, [{ status: 'Ready' }]);
  assert.equal(first._id, retry._id);
  assert.equal(retry.rows[0].status, 'Created');
  assert.notEqual((await startPartnerImport('csv', { _id: 'user2' }, []))._id, first._id);
});

test('resume checkpoints ten rows at most and retries do not reinsert', async t => {
  const job = jobFixture(11), saved = new Map();
  checkpoints(t, job);
  t.mock.method(IndustryPartner, 'findById', async id => saved.get(String(id)));
  t.mock.method(IndustryPartner, 'create', async data => {
    assert.equal(data.approvalStatus, 'Approved');
    assert.equal(data.usedSlots, 0);
    saved.set(String(data._id), data); return data;
  });
  await advancePartnerImport(job, {});
  assert.equal(importSummary(job).created, 10);
  assert.equal(importSummary(job).ready, 1);
  await advancePartnerImport(job, {});
  await advancePartnerImport(job, {});
  assert.equal(saved.size, 11);
  assert.equal(importSummary(job).ready, 0);
});

test('restart after partner insertion recovers Created instead of skipping or duplicating', async t => {
  const job = jobFixture();
  checkpoints(t, job);
  t.mock.method(IndustryPartner, 'findById', async () => ({ _id: job.rows[0].partnerId, name: 'Saved before crash' }));
  t.mock.method(IndustryPartner, 'create', () => assert.fail('must not insert again'));
  await advancePartnerImport(job, {});
  assert.equal(job.rows[0].status, 'Created');
});

test('concurrent duplicate-key winner is recovered, unrelated duplicate is skipped', async t => {
  for (const ownWinner of [true, false]) {
    const job = jobFixture();
    checkpoints(t, job);
    let reads = 0;
    t.mock.method(IndustryPartner, 'findById', async () => ++reads > 1 && ownWinner ? { name: 'Partner' } : null);
    t.mock.method(IndustryPartner, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
    await advancePartnerImport(job, {});
    assert.equal(job.rows[0].status, ownWinner ? 'Created' : 'Skipped');
    t.mock.restoreAll();
  }
});

test('transient errors preserve pending rows, timed-out requests do no new work', async t => {
  const job = jobFixture();
  checkpoints(t, job);
  t.mock.method(IndustryPartner, 'findById', async () => null);
  t.mock.method(IndustryPartner, 'create', async () => { throw new Error('offline'); });
  await assert.rejects(advancePartnerImport(job, {}), /offline/);
  assert.equal(job.rows[0].status, 'Ready');
  await advancePartnerImport(job, { timedout: true });
  assert.equal(job.rows[0].status, 'Ready');
});

test('name is trimmed and uniqueness index is case-insensitive', () => {
  assert.equal(new IndustryPartner({ name: ' Acme ' }).name, 'Acme');
  const [, options] = IndustryPartner.schema.indexes().find(([, options]) => options.name === 'partner_name_ci_unique');
  assert.equal(options.unique, true);
  assert.deepEqual(options.collation, { locale: 'en', strength: 2 });
});

test('permanent validation errors become downloadable skipped results', async t => {
  const job = jobFixture();
  checkpoints(t, job);
  t.mock.method(IndustryPartner, 'findById', async () => null);
  t.mock.method(IndustryPartner, 'create', async () => { throw Object.assign(new Error('invalid'), { name: 'ValidationError' }); });
  await advancePartnerImport(job, {});
  assert.equal(importSummary(job).skipped, 1);
  assert.match(importSummary(job).results[0].message, /correct this row/);
});

test('history and resume endpoints restrict roles and ownership', async t => {
  t.mock.method(PartnerImport, 'findOne', async filter => {
    assert.equal(filter.addedBy, 'actor');
    return null;
  });
  for (const [path, method] of [['/industry-partners/imports', 'get'], ['/industry-partners/imports/:id', 'get'], ['/industry-partners/imports/:id/resume', 'post']]) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
    for (const role of ['HQManager', 'HQStaff', 'Admin', 'IndustryPartner']) {
      const res = { status(n) { this.code = n; return this; }, json() {} };
      route.stack[0].handle({ user: { role } }, res, () => assert.fail('must reject role'));
      assert.equal(res.code, 403);
    }
    if (path.includes(':id')) {
      const res = { status(n) { this.code = n; return this; }, json() {} };
      await route.stack.at(-1).handle({ user: { role: 'SuperAdmin', _id: 'actor' }, params: { id: String(new mongoose.Types.ObjectId()) } }, res);
      assert.equal(res.code, 404);
    }
  }
});
