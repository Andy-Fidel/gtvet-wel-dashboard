import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { notifyUsers } from '../utils/notifications.js';
import { isTrustedPushEndpoint } from '../utils/webPush.js';
import router, { getPlacementExceptionSignals, getScopedHQRecipients } from '../routes/api.js';

const handler = (path, method) => {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;
  assert.ok(route, `Missing ${method.toUpperCase()} ${path}`);
  return route.stack.at(-1).handle;
};

const response = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test('HQ notification recipients follow their institution and region scope', async (t) => {
  const users = [
    { _id: 'super', role: 'SuperAdmin' },
    { _id: 'national', role: 'HQManager', hqScopeType: 'National' },
    { _id: 'ashanti', role: 'HQManager', hqScopeType: 'Region', region: 'Ashanti' },
    { _id: 'accra', role: 'HQManager', hqScopeType: 'Region', region: 'Greater Accra' },
    { _id: 'school-a', role: 'HQManager', hqScopeType: 'Institution', institution: 'School A' },
    { _id: 'school-b', role: 'HQManager', hqScopeType: 'Institution', institution: 'School B' },
  ];
  let filter;
  t.mock.method(User, 'find', (query) => ({ select: async () => { filter = query; return users; } }));
  const recipients = await getScopedHQRecipients({ institution: 'School A', region: 'Ashanti' });
  assert.equal(filter.status, 'Active');
  assert.deepEqual(recipients.map((user) => user._id), ['super', 'national', 'ashanti', 'school-a']);
});

test('push subscriptions accept only known push service hosts', () => {
  assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(isTrustedPushEndpoint('https://web.push.apple.com/Q123'), true);
  for (const endpoint of [
    'https://127.0.0.1/push',
    'https://fcm.googleapis.com.evil.example/send',
    'https://fcm.googleapis.com:8443/send',
    'https://user@fcm.googleapis.com/send',
    'http://fcm.googleapis.com/send',
  ]) assert.equal(isTrustedPushEndpoint(endpoint), false, endpoint);
});

test('notification dispatch only selects active recipients and keeps an atomic event identity', async (t) => {
  const filters = [];
  const created = [];
  t.mock.method(User, 'find', (filter) => ({ select: async () => {
    filters.push(filter);
    if (!filter._id) return [{ _id: 'active-owner' }];
    return [{ _id: 'active-owner', notificationPreferences: {} }];
  } }));
  t.mock.method(Notification, 'exists', async () => false);
  t.mock.method(Notification, 'create', async (record) => { created.push(record); return record; });
  await notifyUsers({ recipientIds: ['inactive-owner'], institution: 'School A', roles: ['Manager'], title: 'Review', message: 'Action required', dedupeKey: 'event-1' });
  assert.equal(filters[0].status, 'Active');
  assert.equal(filters[1].status, 'Active');
  assert.deepEqual(filters[1]._id.$in.sort(), ['active-owner', 'inactive-owner']);
  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'active-owner');
  assert.equal(created[0].dedupeIdentity, 'active-owner:event-1');
});

test('a concurrent duplicate-key insert is treated as an already-created event', async (t) => {
  assert.ok(Notification.schema.indexes().some(([fields, options]) => fields.dedupeIdentity === 1 && options.unique === true));
  t.mock.method(User, 'find', () => ({ select: async () => [{ _id: 'owner', notificationPreferences: {} }] }));
  t.mock.method(Notification, 'exists', async () => false);
  t.mock.method(Notification, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  const result = await notifyUsers({ recipientIds: ['owner'], title: 'Review', message: 'Action required', dedupeKey: 'event-1' });
  assert.equal(result.created, 0);
});

test('inbox filters are scoped to the recipient and exclude dismissed items', async (t) => {
  let filter;
  let countFilter;
  t.mock.method(Notification, 'find', (query) => {
    filter = query;
    return { sort: () => ({ limit: () => ({ populate: async () => [] }) }) };
  });
  t.mock.method(Notification, 'countDocuments', async (query) => { countFilter = query; return 2; });
  const res = response();
  await handler('/notifications', 'get')({ user: { _id: 'owner' }, query: { status: 'unread', type: 'placement', view: 'active' } }, res);
  assert.equal(res.code, 200);
  assert.equal(filter.recipient, 'owner');
  assert.equal(filter.dismissedAt, null);
  assert.equal(filter.read, false);
  assert.equal(filter.type, 'placement');
  assert.equal(countFilter.recipient, 'owner');
  assert.equal(countFilter.dismissedAt, null);
  assert.equal(res.body.unreadCount, 2);
});

test('inbox rejects invalid filters before querying', async () => {
  const res = response();
  await handler('/notifications', 'get')({ user: { _id: 'owner' }, query: { type: 'other' } }, res);
  assert.equal(res.code, 400);
});

test('notification actions always match the signed-in recipient', async (t) => {
  const filters = [];
  t.mock.method(Notification, 'findOneAndUpdate', async (filter) => { filters.push(filter); return null; });
  for (const action of ['read', 'unread', 'dismiss', 'restore']) {
    const res = response();
    await handler(`/notifications/:id/${action}`, 'put')({ user: { _id: 'owner' }, params: { id: '507f1f77bcf86cd799439011' } }, res);
    assert.equal(res.code, 404);
  }
  assert.ok(filters.every((filter) => filter.recipient === 'owner'));
  assert.ok(filters.every((filter) => filter.archivedAt === null));
});

test('attendance overdue notification names the learner from stored name fields', () => {
  const learnerId = '507f1f77bcf86cd799439011';
  const signals = getPlacementExceptionSignals({
    settings: { attendanceCadenceDays: 7, monitoringVisitCadenceDays: 30, midpointAssessmentOffsetDays: 45, finalAssessmentOffsetDays: 0 },
    placements: [{
      _id: '507f1f77bcf86cd799439012',
      learner: { _id: learnerId, firstName: 'Ama', lastName: 'Mensah', trackingId: 'WEL-001' },
      companyName: 'Workshop', supervisorName: 'Supervisor', supervisorPhone: '123',
      startDate: new Date('2020-01-01'), endDate: new Date('2020-12-31'),
    }],
    attendanceByPlacement: new Map(), visitsByLearner: new Map(), assessmentsByLearner: new Map(),
  });
  const attendance = signals.find((signal) => signal.type === 'attendanceOverdue');
  assert.match(attendance.title, /Mensah Ama/);
  assert.match(attendance.message, /Mensah Ama/);
  assert.equal(attendance.link, `/attendance-logs?learnerId=${learnerId}`);
});
