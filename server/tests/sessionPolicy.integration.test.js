import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import authRoutes from '../routes/authRoutes.js';
import { auth, csrfProtection, requireRecentAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { SESSION_IDLE_MS, SESSION_MAX_MS } from '../utils/sessionPolicy.js';
import '../models/IndustryPartner.js';
import '../models/Learner.js';

test('real HTTP and MongoDB enforce idle, absolute, activity, legacy and recent-auth policies', { skip: process.env.SESSION_MONGO_INTEGRATION !== '1' }, async () => {
  const database = `wel_session_policy_qa_${Date.now()}`;
  await mongoose.connect(`mongodb://127.0.0.1:27031/${database}`, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    const user = await User.create({ name: 'Session QA', email: 'session@example.invalid', password: 'Strong-session-password-1', role: 'SuperAdmin', passwordChangeRequired: false });
    const app = express();
    app.use(express.json()); app.use(csrfProtection); app.use('/api/auth', authRoutes);
    app.post('/api/critical', auth, requireRecentAuth, (_req, res) => res.json({ changed: true }));
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const cookies = new Map();
    const request = async (path, method = 'GET', body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': cookies.get('gtvets_csrf') || '' }, body: body ? JSON.stringify(body) : undefined });
      for (const value of res.headers.getSetCookie()) { const pair = value.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
      return { status: res.status, data: await res.json(), cookies: res.headers.getSetCookie() };
    };
    await request('/auth/csrf');
    const login = async () => {
      const result = await request('/auth/login', 'POST', { email: user.email, password: 'Strong-session-password-1' });
      assert.equal(result.status, 200);
      return AuthSession.findById(jwt.decode(cookies.get('gtvets_session')).sid);
    };
    let session = await login();
    const payload = jwt.decode(cookies.get('gtvets_session'));
    assert.equal(payload.exp - payload.iat, SESSION_MAX_MS / 1000);
    let result = await request('/auth/me');
    assert.equal(result.data.session.id, String(session._id));
    assert.ok(result.data.session.expiresAt <= Date.now() + SESSION_MAX_MS);
    const originalActivity = session.lastActivityAt.getTime();
    await request('/auth/session'); await request('/auth/me');
    assert.equal((await AuthSession.findById(session._id)).lastActivityAt.getTime(), originalActivity, 'Background status reads do not extend activity');

    await AuthSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: new Date(Date.now() - 28 * 60000), lastActivityAt: new Date(Date.now() - 28 * 60000) } });
    result = await request('/auth/session/activity', 'POST');
    assert.equal(result.status, 200);
    assert.ok(result.data.idleExpiresAt > Date.now() + 29 * 60000);
    assert.equal((await request('/critical', 'POST', {})).status, 403, 'Recent interaction cannot replace recent authentication');

    await AuthSession.collection.updateOne({ _id: session._id }, { $set: { lastActivityAt: new Date(Date.now() - SESSION_IDLE_MS - 1000), lastSeenAt: new Date() } });
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/session/activity', 'POST')).status, 401, 'Heartbeat cannot revive an idle session');
    assert.equal((await request('/auth/security/sessions')).status, 401);

    session = await login();
    assert.equal((await request('/critical', 'POST', {})).status, 200, 'Reauthentication permits access changes');
    await AuthSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: new Date(Date.now() - SESSION_MAX_MS - 1000), expiresAt: new Date(Date.now() + 7 * 86400000), lastActivityAt: new Date() } });
    assert.equal((await request('/auth/me')).status, 401, 'Legacy seven-day expiry cannot bypass the eight-hour cap');
    assert.equal((await request('/auth/session/activity', 'POST')).status, 401);

    session = await login();
    await AuthSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: new Date(Date.now() - 31 * 60000) }, $unset: { lastActivityAt: 1 } });
    assert.equal((await request('/auth/me')).status, 401, 'Legacy sessions without activity metadata fail safely after idle limit');
    session = await login();
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    assert.equal((await request('/auth/session/activity', 'POST')).status, 401, 'Revoked sessions cannot be renewed');
    assert.equal((await request('/auth/login', 'POST', { email: user.email, password: 'Strong-session-password-1', resumeUserId: 'another-user' })).status, 409);
    session = await login();
    assert.equal((await request('/auth/login', 'POST', { email: user.email, password: 'Strong-session-password-1', resumeUserId: String(user._id) })).status, 200);
    assert.equal((await AuthSession.findById(session._id)).reason, 'Reauthenticated', 'Resuming rotates and revokes the previous session');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
