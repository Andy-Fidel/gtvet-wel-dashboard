import test, { beforeEach } from 'node:test';
import { mockUserManagementLock } from './helpers/userManagementLock.js';
beforeEach(mockUserManagementLock);
import assert from 'node:assert/strict';
import { canLogMonitoringVisit, monitoringScope } from '../utils/monitoringAccess.js';
import router from '../routes/api.js';
import { Placement } from '../models/Placement.js';
import { Learner } from '../models/Learner.js';

test('create denies an out-of-scope learner before saving', async t => {
  t.mock.method(Placement, 'find', filter => {
    assert.equal(filter.status, 'Active');
    return { distinct: async () => ['507f1f77bcf86cd799439012'] };
  });
  t.mock.method(Learner, 'findOne', query => {
    assert.deepEqual(query.$and[1], monitoringScope({ institution: 'Institute A' }, ['507f1f77bcf86cd799439012'], true));
    return { select: async () => null };
  });
  const handler = router.stack.find(x => x.route?.path === '/monitoring-visits' && x.route.methods.post).route.stack.at(-1).handle;
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
  await handler({ user: { role: 'Staff', institution: 'Institute A', _id: 'actor' }, body: { learner: '507f1f77bcf86cd799439011' } }, res);
  assert.equal(res.statusCode, 404);
});

test('only institution staff roles may log monitoring visits', () => {
  for (const role of ['Admin', 'Manager', 'Staff']) assert.equal(canLogMonitoringVisit({ role }), true);
  for (const role of ['SuperAdmin', 'HQManager', 'HQStaff', 'RegionalAdmin', 'IndustryPartner', 'Learner', 'Guardian']) {
    assert.equal(canLogMonitoringVisit({ role }), false);
  }
});

test('delegated learner options and visit records use the correct reference field', () => {
  const user = { institution: 'Institute A' };
  assert.deepEqual(monitoringScope(user, ['delegated-id'], true), {
    $or: [{ institution: 'Institute A' }, { _id: { $in: ['delegated-id'] } }],
  });
  assert.deepEqual(monitoringScope(user, ['delegated-id']), {
    $or: [{ institution: 'Institute A' }, { placement: { $in: ['delegated-id'] } }],
  });
  assert.deepEqual(monitoringScope(user, []), { institution: 'Institute A' });
  assert.deepEqual(monitoringScope({}, []), { institution: '__unassigned__' });
});

test('unpaginated visits retain staff scope and populate the visit’s placement', async t => {
  const { MonitoringVisit } = await import('../models/MonitoringVisit.js');
  const delegated = ['507f1f77bcf86cd799439012'];
  t.mock.method(Placement, 'find', () => ({ distinct: async () => delegated }));
  const populations = [];
  const placement = { companyName: 'Original workplace' };
  t.mock.method(MonitoringVisit, 'find', filter => {
    assert.deepEqual(filter, { ...monitoringScope({ institution: 'Institute A' }, delegated), visitType: 'Routine' });
    return {
      select(fields) { assert.ok(fields.split(' ').includes('placement')); return this; },
      populate(...args) { populations.push(args); return this; },
      sort() { return this; },
      lean: async () => [{ placement }],
    };
  });
  const handler = router.stack.find(x => x.route?.path === '/monitoring-visits' && x.route.methods.get).route.stack.at(-1).handle;
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
  await handler({ user: { role: 'Staff', institution: 'Institute A', _id: 'actor' }, query: { visitType: 'Routine' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body[0].placement, placement);
  assert.ok(populations.some(([path, fields]) => path === 'placement' && fields === 'companyName'));
});
