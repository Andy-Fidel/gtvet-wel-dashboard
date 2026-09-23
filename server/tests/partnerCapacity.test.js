import test from 'node:test';
import assert from 'node:assert/strict';
import { Placement } from '../models/Placement.js';
import { PartnerSlotAllocation } from '../models/PartnerSlotAllocation.js';
import { partnerCapacityAt } from '../utils/partnerCapacity.js';

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
