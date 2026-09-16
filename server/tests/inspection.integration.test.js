import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import authRoutes from '../routes/authRoutes.js';
import apiRoutes from '../routes/api.js';
import { csrfProtection, inspectionReadOnlyGuard } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { Learner } from '../models/Learner.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';
import { Placement } from '../models/Placement.js';
import { PlacementMessage } from '../models/PlacementMessage.js';

test('HTTP inspection is scoped, read-only, audited, time-limited and revocable by the parent', { skip: process.env.SECURITY_MONGO_INTEGRATION !== '1' }, async () => {
  const database = `wel_inspection_qa_${Date.now()}`;
  await mongoose.connect(`mongodb://127.0.0.1:27031/${database}`, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await Promise.all([User.init(), AuthSession.init(), MfaCredential.init()]);
    const password = 'Inspection-QA-password-1';
    const admin = await User.create({ name: 'Inspector', email: 'inspector@example.invalid', password, role: 'SuperAdmin', passwordChangeRequired: false });
    const staff = await User.create({ name: 'Target', email: 'target@example.invalid', password, role: 'Staff', institution: 'QA North', passwordChangeRequired: true });
    const inactive = await User.create({ name: 'Inactive', email: 'inactive@example.invalid', password, role: 'Staff', institution: 'QA North', status: 'Inactive' });
    // Raw fixture inserts deliberately avoid unrelated learner-form requirements.
    const one = await Learner.collection.insertOne({ firstName: 'Inspection', lastName: 'North', institution: 'QA North', trackingId: 'INSPECT-N', status: 'Pending' });
    await Learner.collection.insertOne({ firstName: 'Inspection', lastName: 'South', institution: 'QA South', trackingId: 'INSPECT-S', status: 'Pending' });
    const placement = await Placement.collection.insertOne({ institution: 'QA North', learner: one.insertedId, owner: staff._id, status: 'Active' });
    const message = await PlacementMessage.collection.insertOne({ placement: placement.insertedId, senderUser: admin._id, message: 'QA unread message', readBy: [] });
    const app = express(); app.use(express.json()); app.use(csrfProtection); app.use(inspectionReadOnlyGuard);
    app.use('/api/auth', authRoutes); app.use('/api', apiRoutes);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const client = () => {
      const cookies = new Map();
      return async (path, method = 'GET', body, headers = {}) => {
        const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), 'X-CSRF-Token': cookies.get('gtvets_csrf') || '', ...headers }, body: body ? JSON.stringify(body) : undefined });
        for (const entry of response.headers.getSetCookie()) { const pair = entry.split(';')[0]; const index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
        return { status: response.status, data: await response.json() };
      };
    };
    const inspector = client(), target = client();
    await inspector('/auth/csrf'); await target('/auth/csrf');
    assert.equal((await inspector('/auth/login', 'POST', { email: admin.email, password })).status, 200);
    assert.equal((await target('/auth/login', 'POST', { email: staff.email, password })).status, 200);
    const start = { userId: String(staff._id), password, reason: 'Investigating learner visibility issue' };
    assert.equal((await target('/auth/inspection/start', 'POST', start)).status, 403);
    assert.equal((await inspector('/auth/inspection/start', 'POST', { ...start, password: 'wrong' })).status, 403);
    assert.equal((await inspector('/auth/inspection/start', 'POST', { ...start, reason: 'short' })).status, 400);
    assert.equal((await inspector('/auth/inspection/start', 'POST', { ...start, userId: String(admin._id) })).status, 400);
    assert.equal((await inspector('/auth/inspection/start', 'POST', { ...start, userId: String(inactive._id) })).status, 400);
    const targetBefore = await User.findById(staff._id).lean();
    assert.equal((await inspector('/auth/inspection/start', 'POST', start)).status, 200);
    const me = await inspector('/auth/me');
    assert.equal(me.data._id, String(staff._id));
    assert.equal(me.data.inspection.readOnly, true);
    assert.equal(me.data.inspection.actorName, admin.name);
    assert.equal(me.data.passwordChangeRequired, false, 'Inspector need not change target password');
    assert.equal((await User.findById(staff._id)).passwordChangeRequired, true);
    assert.equal((await User.findById(staff._id)).lastLoginAt.getTime(), targetBefore.lastLoginAt.getTime(), 'Inspection is not a login by the target');
    const found = await inspector('/search?q=Inspection');
    assert.equal(found.status, 200);
    assert.deepEqual(found.data.learners.map(row => row._id), [String(one.insertedId)]);
    assert.equal((await inspector('/users')).status, 403, 'Target permissions still apply');
    for (const path of ['/learners', '/notifications/read-all', '/auth/change-password', '/auth/security/mfa/setup', '/auth/register', '/auth/login', '/auth/forgot-password', '/auth/inspection/start']) {
      assert.equal((await inspector(path, 'POST', start)).status, 403, `Inspection cannot write ${path}`);
    }
    assert.equal((await inspector('/auth/security/sessions')).status, 403);
    assert.equal((await inspector('/search?q=Inspection', 'GET', undefined, { 'X-Session-User': String(admin._id) })).status, 409, 'Old tabs cannot silently switch identity');
    const notificationsBefore = await Notification.countDocuments();
    assert.equal((await inspector('/notifications')).status, 200);
    assert.equal(await Notification.countDocuments(), notificationsBefore, 'No notifications are generated during inspection');
    assert.equal((await inspector(`/placements/${placement.insertedId}/messages`)).status, 200);
    assert.deepEqual((await PlacementMessage.findById(message.insertedId)).readBy, [], 'Inspection must not mark messages read');
    const session = await AuthSession.findOne({ inspectorId: admin._id, revokedAt: null });
    assert.ok(new Date(session.expiresAt).getTime() - Date.now() <= 15 * 60000);
    await AuthSession.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await inspector('/auth/me')).status, 401, 'Expired inspection is denied');
    assert.equal((await inspector('/auth/inspection/stop', 'POST')).status, 200, 'Return works after inspection expiry');
    assert.equal((await inspector('/auth/me')).data._id, String(admin._id));
    const events = await AuditLog.find({ entityType: 'UserInspection' }).lean();
    assert.equal(events.length, 2);
    assert.ok(events.every(event => String(event.actorId) === String(admin._id) && event.metadata.targetUserId === String(staff._id)));
    assert.equal((await inspector('/auth/inspection/start', 'POST', start)).status, 200);
    const child = await AuthSession.findOne({ inspectorId: admin._id, revokedAt: null });
    await AuthSession.updateOne({ _id: child.parentSessionId }, { $set: { revokedAt: new Date() } });
    assert.equal((await inspector('/auth/me')).status, 401, 'Revoking parent stops inspection');
    assert.equal((await inspector('/auth/inspection/stop', 'POST')).status, 401, 'Cannot resurrect a revoked administrator session');
    assert.equal((await inspector('/auth/login', 'POST', { email: admin.email, password })).status, 200, 'Failed restoration clears inspection cookies so login works');
    assert.equal((await target('/auth/me')).status, 200, 'Actual user session is unaffected');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
