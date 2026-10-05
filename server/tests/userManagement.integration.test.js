import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import apiRoutes from '../routes/api.js';
import authRoutes from '../routes/authRoutes.js';
import { auth, csrfProtection, inspectionReadOnlyGuard, JWT_SECRET } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { AccessApproval } from '../models/AccessApproval.js';
import { AuthSession } from '../models/AuthSession.js';
import { Notification } from '../models/Notification.js';
import { UserManagementLock } from '../models/UserManagementLock.js';
import { createAuthSession } from '../utils/authSessions.js';
import { serializeManagedUser, userInput, withUserManagementLock, userAssignmentMutation } from '../utils/userManagement.js';

const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } });
const call = async (actor, path, method, body = {}, params = {}) => {
  const route = apiRoutes.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const res = response();
  await route.stack.at(-1).handle({ user: actor, body, params, query: {}, headers: {} }, res);
  return res;
};
const secrets = ['password', 'resetPasswordToken', 'resetPasswordExpires', 'sessionVersion'];
const assertPublic = user => { for (const key of secrets) assert.equal(user[key], undefined, key); };

test('managed user responses and input use explicit public and editable fields', () => {
  const doc = new User({ name: 'QA', email: 'qa@example.invalid', password: 'hash', resetPasswordToken: 'reset-hash', resetPasswordExpires: new Date(), sessionVersion: 9 });
  assertPublic(serializeManagedUser(doc));
  assertPublic(serializeManagedUser(doc.toObject()));
  assert.deepEqual(userInput({ name: 'QA', sessionVersion: 0, passwordChangeRequired: false, resetPasswordToken: 'injected' }), { name: 'QA' });
});

test('real MongoDB: user lifecycle, account safety, scope, sessions and approvals', { skip: process.env.USER_MANAGEMENT_MONGO_INTEGRATION !== '1' }, async t => {
  const database = `wel_user_management_qa_${Date.now()}`;
  await mongoose.connect(`mongodb://127.0.0.1:27032/${database}`, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  let server;
  let sequence = 0;
  const password = 'QA-password-123';
  const account = extra => User.create({ name: 'QA Staff', email: `qa${++sequence}@example.invalid`, password, role: 'Staff', institution: 'QA A', region: 'Ashanti', passwordChangeRequired: false, ...extra });
  const params = user => ({ id: String(user._id) });
  try {
    await User.init();
    await Institution.collection.insertMany([{ name: 'QA A', region: 'Ashanti' }, { name: 'QA B', region: 'Ashanti' }]);
    const admin = await account({ role: 'Admin' });
    const adminB = await account({ role: 'Admin', institution: 'QA B' });
    const root = await account({ role: 'SuperAdmin', institution: '', region: '' });

    await t.test('list, registry, create and update never expose credential material or accept security metadata', async () => {
      const target = await account({ resetPasswordToken: 'synthetic-reset-hash', resetPasswordExpires: new Date(Date.now() + 60000) });
      const list = await call(admin, '/users', 'get');
      assert.equal(list.code, 200);
      assertPublic(list.body.find(user => user._id === String(target._id)));
      const registry = await call(admin, '/users/registry', 'get');
      assert.equal(registry.code, 200);
      registry.body.items.forEach(assertPublic);
      const created = await call(admin, '/users', 'post', { name: 'Created QA', email: 'created@example.invalid', password, role: 'Staff', institution: 'QA A', passwordChangeRequired: false, sessionVersion: 100, resetPasswordToken: 'injected' });
      assert.equal(created.code, 201);
      assertPublic(created.body);
      assert.equal(created.body.passwordChangeRequired, true);
      const updated = await call(admin, '/users/:id', 'put', { name: 'Updated QA', passwordChangeRequired: false, sessionVersion: 100 }, params(target));
      assert.equal(updated.code, 200);
      assertPublic(updated.body);
      assert.equal((await User.findById(target._id).select('+sessionVersion')).sessionVersion, 0);
    });

    await t.test('deletion, suspension, role changes and scope changes all enforce assigned-work blockers', async () => {
      const owner = await account();
      const learner = await Learner.collection.insertOne({ firstName: 'QA', lastName: 'Owned', trackingId: 'QA-OWNED', institution: 'QA A', owner: owner._id });
      for (const [method, body] of [['delete', {}], ['put', { status: 'Inactive' }], ['put', { institution: 'QA B' }], ['put', { role: 'Manager' }]]) {
        const result = await call(root, '/users/:id', method, body, params(owner));
        assert.equal(result.code, 409);
        assert.equal(result.body.blockers.learnersOwned[0]._id, String(learner.insertedId));
        assert.equal((await User.findById(owner._id)).institution, 'QA A');
      }
      await Learner.updateOne({ _id: learner.insertedId }, { $set: { owner: admin._id } });
      assert.equal((await call(root, '/users/:id', 'put', { institution: 'QA B' }, params(owner))).code, 200);
      assert.equal((await call(admin, '/users/:id', 'delete', {}, params(owner))).code, 403);
      assert.equal((await call(adminB, '/users/:id', 'delete', {}, params(owner))).code, 200);
      assert.ok(await Learner.exists({ _id: learner.insertedId, owner: admin._id }));
    });

    await t.test('receiving institution can release its managed officer’s delegation without changing the originating placement', async () => {
      const delegate = await account({ institution: 'QA B' });
      const originManager = await account({ role: 'Manager' });
      const learner = await Learner.collection.insertOne({ firstName: 'QA', lastName: 'Delegated', trackingId: 'QA-DELEGATED', institution: 'QA A' });
      const placement = await Placement.collection.insertOne({ learner: learner.insertedId, institution: 'QA A', companyName: 'QA Workplace', status: 'Active', owner: admin._id, delegate: delegate._id, delegateInstitution: 'QA B', workflowVersion: 3 });
      const blocked = await call(adminB, '/users/:id', 'put', { status: 'Inactive' }, params(delegate));
      assert.equal(blocked.code, 409);
      assert.equal(blocked.body.blockers.delegatedPlacements[0].companyName, 'QA Workplace');
      const releaseParams = { ...params(delegate), placementId: String(placement.insertedId) };
      assert.equal((await call(admin, '/users/:id/delegations/:placementId/release', 'put', {}, releaseParams)).code, 404);
      assert.equal((await call(adminB, '/users/:id/delegations/:placementId/release', 'put', {}, releaseParams)).code, 200);
      assert.equal((await call(adminB, '/users/:id/delegations/:placementId/release', 'put', {}, releaseParams)).code, 409);
      const after = await Placement.findById(placement.insertedId);
      assert.equal(after.delegate, undefined);
      assert.equal(String(after.owner), String(admin._id));
      assert.equal(after.status, 'Active');
      assert.equal(after.workflowVersion, 4);
      assert.ok(await Notification.exists({ recipient: originManager._id, dedupeKey: `delegate-release:${placement.insertedId}:3` }), 'Originating management must know a replacement officer is needed');
      assert.equal((await call(adminB, '/users/:id', 'put', { status: 'Inactive' }, params(delegate))).code, 200);
    });

    await t.test('suspend/reactivate and role round trips permanently invalidate earlier sessions', async () => {
      const target = await account();
      const session = await createAuthSession(target, { headers: {} });
      const token = jwt.sign({ userId: String(target._id), sid: String(session._id) }, JWT_SECRET, { expiresIn: '1h' });
      const accepted = async () => {
        let allowed = false;
        await auth({ headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/learners' }, response(), () => { allowed = true; });
        return allowed;
      };
      assert.equal(await accepted(), true);
      for (const status of ['Inactive', 'Active']) assert.equal((await call(admin, '/users/:id', 'put', { status }, params(target))).code, 200);
      assert.equal(await accepted(), false);
      assert.ok((await AuthSession.findById(session._id)).revokedAt);
      for (const role of ['Manager', 'Staff']) assert.equal((await call(admin, '/users/:id', 'put', { role }, params(target))).code, 200);
      assert.equal((await User.findById(target._id).select('+sessionVersion')).sessionVersion, 4);
    });

    await t.test('self-removal is rejected and concurrent SuperAdmin changes preserve an active administrator', async () => {
      for (const [method, body] of [['delete', {}], ['put', { status: 'Inactive' }], ['put', { role: 'Staff', institution: 'QA A' }]])
        assert.equal((await call(root, '/users/:id', method, body, params(root))).code, 409);
      const other = await account({ role: 'SuperAdmin', institution: '', region: '' });
      const results = await Promise.all([
        call(root, '/users/:id', 'put', { status: 'Inactive' }, params(other)),
        call(other, '/users/:id', 'put', { status: 'Inactive' }, params(root)),
      ]);
      assert.deepEqual(results.map(result => result.code).sort(), [200, 409]);
      assert.equal(await User.countDocuments({ role: 'SuperAdmin', status: 'Active' }), 1);
      const remaining = await User.findOne({ role: 'SuperAdmin', status: 'Active' });
      const inactive = String(remaining._id) === String(root._id) ? other : root;
      assert.equal((await call(inactive, '/users/:id', 'delete', {}, params(remaining))).code, 409);
      // Restore the fixture for subsequent HTTP tests.
      await User.updateMany({ role: 'SuperAdmin' }, { $set: { status: 'Active' } });
    });

    await t.test('implementation requires the approved account, role and scope; retries cannot overwrite it', async () => {
      const target = await account();
      const wrong = await account({ role: 'Manager', institution: 'QA B' });
      const approval = await AccessApproval.create({ subject: 'Move QA Staff', description: 'Promote and move to QA B', requester: admin._id, requesterRole: 'Admin', targetUser: target._id, requestedRole: 'Manager', requestedInstitution: 'QA B', requestedRegion: 'Ashanti', status: 'Approved' });
      const implement = id => call(root, '/access-approvals/:id/implement', 'put', { implementedUserId: String(id) }, params(approval));
      assert.equal((await implement(new mongoose.Types.ObjectId())).code, 404);
      assert.equal((await implement(wrong._id)).code, 409);
      assert.equal((await implement(target._id)).code, 409);
      assert.equal((await call(root, '/users/:id', 'put', { role: 'Manager' }, params(target))).code, 200);
      assert.equal((await implement(target._id)).code, 409);
      assert.equal((await call(root, '/users/:id', 'put', { institution: 'QA B' }, params(target))).code, 200);
      assert.equal((await implement(target._id)).code, 200);
      const completedAt = (await AccessApproval.findById(approval._id)).implementedAt.getTime();
      assert.equal((await implement(target._id)).code, 200);
      assert.equal((await implement(wrong._id)).code, 409);
      assert.equal((await AccessApproval.findById(approval._id)).implementedAt.getTime(), completedAt);
    });

    const app = express(); app.use(express.json()); app.use(csrfProtection); app.use(inspectionReadOnlyGuard);
    app.use('/api/auth', authRoutes); app.use('/api', apiRoutes);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const client = () => {
      const cookies = new Map();
      return async (path, method = 'GET', body) => {
        const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), 'X-CSRF-Token': cookies.get('gtvets_csrf') || '' }, body: body ? JSON.stringify(body) : undefined });
        for (const entry of res.headers.getSetCookie()) { const pair = entry.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
        return { status: res.status, data: await res.json() };
      };
    };

    await t.test('HTTP requires password setup and allows an inspector to read without changing the target password', async () => {
      const target = await account({ passwordChangeRequired: true });
      const request = client(), inspector = client();
      await request('/auth/csrf'); await inspector('/auth/csrf');
      assert.equal((await request('/auth/login', 'POST', { email: target.email, password })).status, 200);
      assert.equal((await request('/auth/me')).data.passwordChangeRequired, true);
      assert.equal((await request('/notifications')).data.code, 'PASSWORD_CHANGE_REQUIRED');
      assert.equal((await request('/learners', 'POST', {})).status, 403);
      assert.equal((await inspector('/auth/login', 'POST', { email: root.email, password })).status, 200);
      assert.equal((await inspector('/auth/inspection/start', 'POST', { userId: String(target._id), password, reason: 'Verify password setup restriction' })).status, 200);
      assert.equal((await inspector('/auth/me')).data.passwordChangeRequired, false);
      assert.equal((await inspector('/notifications')).status, 200);
      assert.equal((await inspector('/auth/change-password', 'POST', { newPassword: 'New-QA-password' })).status, 403);
      assert.equal((await User.findById(target._id)).passwordChangeRequired, true);
      assert.equal((await request('/auth/change-password', 'POST', { newPassword: 'New-QA-password' })).status, 200);
      assert.equal((await request('/auth/me')).data.passwordChangeRequired, false);
      assert.equal((await request('/notifications')).status, 200);
    });

    await t.test('HTTP assignments share the lifecycle lock and cannot appoint inactive owners', async () => {
      const request = client(); await request('/auth/csrf');
      assert.equal((await request('/auth/login', 'POST', { email: admin.email, password })).status, 200);
      const inactive = await account({ status: 'Inactive' });
      const learner = await Learner.create({ firstName: 'QA', lastName: 'Assignment', indexNumber: 'QA-ASSIGN', program: 'Automotive', year: '1', institution: 'QA A', region: 'Ashanti' });
      await withUserManagementLock(async () => {
        assert.equal((await request(`/learners/${learner._id}/owner`, 'PUT', { ownerId: String(admin._id) })).status, 409);
      });
      assert.equal((await request(`/learners/${learner._id}/owner`, 'PUT', { ownerId: String(inactive._id) })).status, 400);
      // Sending the response precedes the final database lease release.
      const deadline = Date.now() + 1000;
      while (await UserManagementLock.exists({ _id: 'lifecycle', token: { $exists: true } })) {
        assert.ok(Date.now() < deadline, 'Assignment lock must be released after completion');
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      assert.equal((await request(`/learners/${learner._id}/owner`, 'PUT', { ownerId: String(admin._id) })).status, 200);
      assert.equal(String((await Learner.findById(learner._id)).owner), String(admin._id));
    });

    await t.test('assignment locking waits for handler completion even when a response closes early', async () => {
      const deadline = Date.now() + 1000;
      while (await UserManagementLock.exists({ _id: 'lifecycle', token: { $exists: true } })) {
        assert.ok(Date.now() < deadline);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      let resume, started;
      const ready = new Promise(resolve => { started = resolve; });
      const pendingWork = new Promise(resolve => { resume = resolve; });
      const mutation = userAssignmentMutation(async (_req, res) => { res.json({ accepted: true }); started(); await pendingWork; });
      const running = mutation({}, response());
      await ready;
      try {
        await assert.rejects(withUserManagementLock(async () => {}), error => error.status === 409);
      } finally { resume(); await running; }
      assert.equal(await UserManagementLock.exists({ _id: 'lifecycle', token: { $exists: true } }), null);
    });

    await t.test('a request authenticated before an access change cannot mutate using stale permissions', async () => {
      const actor = await account({ role: 'Admin' });
      const authSession = await createAuthSession(actor, { headers: {} });
      await User.updateOne({ _id: actor._id }, { $set: { role: 'Staff' }, $inc: { sessionVersion: 1 } });
      let mutated = false;
      const mutation = userAssignmentMutation(async () => { mutated = true; });
      const res = response();
      await mutation({ user: actor, authSession }, res);
      assert.equal(res.code, 401);
      assert.equal(mutated, false);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
