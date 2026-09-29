import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { notifyUsers } from '../utils/notifications.js';
import { isTrustedPushEndpoint } from '../utils/webPush.js';
import { getScopedHQRecipients } from '../routes/api.js';

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
