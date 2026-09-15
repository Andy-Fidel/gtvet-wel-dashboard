import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Placement } from '../models/Placement.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { placementLearnerIds, placementInput, validatePlacementDates, placementOperationKey } from '../utils/placementWorkflow.js';
import router from '../routes/api.js';

test('placement dates must be valid, present and ordered', async () => {
  for (const dates of [[null, null], ['invalid', '2026-10-01'], ['2026-10-02', '2026-10-01']]) assert.throws(() => validatePlacementDates(...dates));
  validatePlacementDates('2026-10-01', '2026-10-01');
  await assert.rejects(new Placement({ learner: new mongoose.Types.ObjectId(), companyName: 'QA', sector: 'IT', location: 'QA', institution: 'QA', coordinates: { lat: 0, lng: 0 }, startDate: '2026-10-02', endDate: '2026-10-01' }).validate(), /end date/);
});

test('learner selection rejects duplicates, empty batches and malformed identifiers', () => {
  const id = String(new mongoose.Types.ObjectId());
  for (const value of [[], null, id, ['bad'], [id, id], Array(201).fill(id)]) assert.throws(() => placementLearnerIds(value));
  assert.deepEqual(placementLearnerIds([id]), [id]);
});

test('request capacity must match a positive integer learner count', async () => {
  const id = new mongoose.Types.ObjectId();
  for (const slots of [-1, 0, 0.5, 2]) await assert.rejects(new PlacementRequest({ institution: 'QA', program: 'IT', learners: [id], submittedBy: id, requestedSlots: slots }).validate());
  await new PlacementRequest({ institution: 'QA', program: 'IT', learners: [id], submittedBy: id, requestedSlots: 1 }).validate();
});

test('activation allowlist excludes forged ownership, delegation, status and closure fields', () => {
  assert.deepEqual(placementInput({ companyName: 'QA', owner: 'foreign', delegate: 'foreign', partnerSupervisor: 'foreign', institution: 'foreign', status: 'Completed', closedBy: 'foreign' }), { companyName: 'QA' });
});

test('retry keys are deterministic and isolated by actor and institution', () => {
  const user = { _id: 'actor', institution: 'QA' };
  assert.equal(placementOperationKey(user, 'create', { a: 1, b: 2 }), placementOperationKey(user, 'create', { b: 2, a: 1 }));
  assert.notEqual(placementOperationKey(user, 'create', {}), placementOperationKey({ ...user, institution: 'Other' }, 'create', {}));
});

test('database duplicate prevention is partial and is installed explicitly', () => {
  const [fields, options] = Placement.schema.indexes().find(([, options]) => options.name === 'one_active_placement_per_learner');
  assert.deepEqual(fields, { learner: 1 });
  assert.equal(options.unique, true);
  assert.deepEqual(options.partialFilterExpression, { status: 'Active' });
  assert.equal(Placement.schema.options.autoIndex, false);
});

test('Staff and oversight users cannot use either activation endpoint', async () => {
  for (const path of ['/placements', '/placement-requests/:id/convert']) {
    const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route.stack.at(-1).handle;
    for (const role of ['Staff', 'RegionalAdmin', 'SuperAdmin', 'HQManager', 'HQStaff', 'IndustryPartner']) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      await handler({ user: { role, institution: 'QA' }, body: {} }, res);
      assert.equal(res.code, 403);
    }
  }
});
