import test from 'node:test';
import assert from 'node:assert/strict';
import { Placement } from '../models/Placement.js';
import { PartnerSlotAllocation } from '../models/PartnerSlotAllocation.js';
import { partnerCapacityAt } from '../utils/partnerCapacity.js';
import router from '../routes/api.js';

test('institution capacity combines its unused reservation with the remaining shared pool', async t => {
  t.mock.method(PartnerSlotAllocation, 'find', () => ({
    select() { return this; },
    lean: async () => [
      { institution: 'Accra Institute', slots: 4 },
      { institution: 'Other Institute', slots: 3 },
    ],
  }));
  t.mock.method(Placement, 'aggregate', async () => [
    { _id: 'Accra Institute', count: 2 },
    { _id: 'Other Institute', count: 4 },
  ]);

  const capacity = await partnerCapacityAt({
    partner: { _id: 'partner-id', totalSlots: 10 },
    institution: 'Accra Institute',
    date: '2026-10-01',
  });

  assert.deepEqual(capacity, {
    totalSlots: 10,
    reservedSlots: 4,
    reservedAvailable: 2,
    sharedCapacity: 3,
    sharedAvailable: 2,
    availableSlots: 4,
    institutionActive: 2,
    reservedTotal: 7,
  });
});

test('slot allocation dates must be ordered', async () => {
  const base = {
    partner: '507f1f77bcf86cd799439011',
    institution: 'Accra Institute',
    slots: 2,
    requestedBy: '507f191e810c19729de860ea',
  };
  await assert.rejects(new PartnerSlotAllocation({ ...base, startDate: '2026-10-02', endDate: '2026-10-01' }).validate(), /cannot be before/);
  await new PartnerSlotAllocation({ ...base, startDate: '2026-10-01', endDate: '2026-10-02' }).validate();
});

test('pending slot queue is SuperAdmin-only and returns all institutions with pagination', async t => {
  const route = router.stack.find(layer => layer.route?.path === '/slot-allocations/pending')?.route;
  assert.ok(route);
  const authorize = route.stack[0].handle;
  let deniedStatus;
  authorize({ user: { role: 'Admin' } }, { status(code) { deniedStatus = code; return this; }, json() {} }, () => assert.fail('Admin cannot read the queue'));
  assert.equal(deniedStatus, 403);

  let filter;
  let skip;
  let limit;
  t.mock.method(PartnerSlotAllocation, 'find', query => {
    filter = query;
    return {
      sort() { return this; },
      skip(value) { skip = value; return this; },
      limit(value) { limit = value; return this; },
      populate() { return this; },
      lean: async () => [{ _id: 'request-1', institution: 'School A' }],
    };
  });
  t.mock.method(PartnerSlotAllocation, 'countDocuments', async () => 25);
  let payload;
  await route.stack.at(-1).handle({ user: { role: 'SuperAdmin' }, query: { page: '2', pageSize: '20' } }, { json(value) { payload = value; }, status() { return this; } });
  assert.deepEqual(filter, { status: 'Pending' });
  assert.equal(skip, 20);
  assert.equal(limit, 20);
  assert.equal(payload.total, 25);
  assert.equal(payload.totalPages, 2);
  assert.equal(payload.items[0].institution, 'School A');
});
