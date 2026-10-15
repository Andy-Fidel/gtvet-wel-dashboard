import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_WARNING_MS, RECENT_AUTH_MS, sessionDeadlines, sessionExpired, sessionMetadata } from '../utils/sessionPolicy.js';
import { auth, JWT_SECRET, requireRecentAuth, setSessionCookies } from '../middleware/auth.js';
import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { credentialVersion } from '../utils/authSessions.js';
import authRoutes from '../routes/authRoutes.js';

const now = Date.now();
const uid = '507f1f77bcf86cd799439011';
const sid = '507f1f77bcf86cd799439012';
const fresh = (changes = {}) => ({ _id: sid, userId: uid, createdAt: new Date(now), lastActivityAt: new Date(now), lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_MAX_MS), ...changes });
const response = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; }, getHeader(key) { return this.headers[key]; }, setHeader(key, value) { this.headers[key] = value; } });
const chain = value => ({ select() { return this; }, populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const handler = (path, method) => authRoutes.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;

test('sessions expire exactly at idle and absolute boundaries; activity cannot exceed the maximum', () => {
  const session = fresh();
  assert.equal(sessionExpired(session, now + SESSION_IDLE_MS - 1), false);
  assert.equal(sessionExpired(session, now + SESSION_IDLE_MS), true);
  session.lastActivityAt = new Date(now + SESSION_MAX_MS - 1);
  assert.equal(sessionExpired(session, now + SESSION_MAX_MS - 1), false);
  assert.equal(sessionExpired(session, now + SESSION_MAX_MS), true);
  assert.equal(sessionMetadata(session, now).warningMs, SESSION_WARNING_MS);
});

test('legacy seven-day sessions are capped and malformed dates fail closed', () => {
  const session = fresh({ expiresAt: new Date(now + 7 * 86400000) });
  assert.equal(sessionDeadlines(session).expiresAt, now + SESSION_MAX_MS);
  delete session.lastActivityAt;
  session.lastSeenAt = new Date(now + SESSION_IDLE_MS);
  assert.equal(sessionExpired(session, now + SESSION_IDLE_MS), true, 'Background bookkeeping does not extend legacy sessions');
  assert.equal(sessionExpired({}), true);
});

test('cookie lifetime is eight hours', () => {
  const res = response();
  setSessionCookies(res, 'token');
  const cookies = res.headers['Set-Cookie'];
  assert.ok(cookies.every(cookie => cookie.includes(`Max-Age=${SESSION_MAX_MS / 1000}`)));
  assert.ok(cookies.find(cookie => cookie.startsWith('gtvets_session=')).includes('HttpOnly'));
});

test('background API reads cannot keep an idle session alive', async t => {
  const user = { _id: uid, status: 'Active', role: 'Admin', password: 'hash' };
  let session = fresh({ credentialVersion: credentialVersion(user), lastActivityAt: new Date(Date.now() - SESSION_IDLE_MS - 1) });
  t.mock.method(User, 'findById', () => chain(user));
  t.mock.method(AuthSession, 'findOne', () => chain(session));
  t.mock.method(MfaCredential, 'exists', async () => null);
  const update = t.mock.method(AuthSession, 'updateOne', async () => assert.fail('Expired sessions must not be touched'));
  const req = { headers: { authorization: `Bearer ${jwt.sign({ userId: uid, sid }, JWT_SECRET, { expiresIn: '1h' })}` }, method: 'GET', originalUrl: '/api/notifications' };
  const res = response();
  await auth(req, res, () => assert.fail('Idle session must be rejected'));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'SESSION_EXPIRED');
  assert.equal(update.mock.callCount(), 0);
  session = fresh({ credentialVersion: credentialVersion(user), lastSeenAt: new Date(), lastActivityAt: new Date() });
  await auth(req, response(), () => {});
  assert.equal(update.mock.callCount(), 0, 'Reads do not update lastActivityAt');
});

test('status reads never write, and activity updates cannot resurrect revoked or expired sessions', async t => {
  const session = fresh();
  const req = { authSession: session };
  const update = t.mock.method(AuthSession, 'updateOne', async (filter, mutation) => {
    assert.equal(filter.revokedAt, null);
    assert.ok(filter.expiresAt.$gt instanceof Date);
    assert.ok(filter.createdAt.$gt instanceof Date);
    assert.equal(filter.$or.length, 2);
    assert.ok(mutation.$max.lastActivityAt instanceof Date);
    return { matchedCount: 0 };
  });
  const res = response();
  await handler('/session', 'get')(req, res);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(res.body.id, sid);
  await handler('/session/activity', 'post')(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'SESSION_EXPIRED');
});

test('critical access changes require recent authentication, independently of activity', () => {
  const req = { authSession: fresh({ createdAt: new Date(Date.now() - RECENT_AUTH_MS - 1), lastActivityAt: new Date() }) };
  const res = response();
  requireRecentAuth(req, res, () => assert.fail('Recent activity is not recent authentication'));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'REAUTHENTICATION_REQUIRED');
  req.authSession.createdAt = new Date();
  let allowed = false;
  requireRecentAuth(req, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});
