import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { auth, JWT_SECRET } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { credentialVersion, createAuthSession } from '../utils/authSessions.js';
import { encryptSecret, decryptSecret, createTotp, validCounter, newRecoveryCodes, recoveryHash, consumeMfaCode } from '../utils/mfa.js';
import router from '../routes/securityRoutes.js';

const id = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';
const sid = '507f1f77bcf86cd799439013';
const user = { _id: id, role: 'SuperAdmin', status: 'Active', password: 'hashed-password', sessionVersion: 0 };
const chain = value => ({ select() { return this; }, populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {}, getHeader() {} });
const handler = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;

test('credential fingerprint changes with password, status, role, scope and revoke-all version', () => {
  for (const change of [{ password: 'new' }, { status: 'Inactive' }, { role: 'Staff' }, { institution: 'Other' }, { region: 'Other' }, { hqScopeType: 'Region' }, { sessionVersion: 1 }, { partnerPortalRole: 'Supervisor' }, { linkedLearners: [id] }]) {
    assert.notEqual(credentialVersion(user), credentialVersion({ ...user, ...change }));
  }
  assert.equal(credentialVersion({ ...user, partnerId: id, linkedLearners: [otherId] }), credentialVersion({ ...user, partnerId: { _id: id }, linkedLearners: [{ _id: otherId }] }));
});

test('session creation stores metadata but never a bearer token or password', async t => {
  t.mock.method(AuthSession, 'create', async data => {
    assert.equal(data.userId, id);
    assert.equal(data.userAgent.length, 500);
    assert.equal(data.mfaVerified, true);
    assert.ok(data.expiresAt > new Date());
    assert.equal(data.password, undefined);
    assert.equal(data.token, undefined);
    return data;
  });
  await createAuthSession(user, { ip: '127.0.0.1', headers: { 'user-agent': 'x'.repeat(600) } }, true);
});

test('auth rejects old stateless tokens, revoked sessions, changed credentials, and missing MFA verification', async t => {
  let storedUser = user;
  let session = { _id: sid, credentialVersion: credentialVersion(user), lastSeenAt: new Date(), mfaVerified: false };
  let mfa = null;
  t.mock.method(User, 'findById', () => chain(storedUser));
  t.mock.method(AuthSession, 'findOne', filter => { assert.equal(filter.revokedAt, null); assert.ok(filter.expiresAt.$gt); return chain(session); });
  t.mock.method(MfaCredential, 'exists', async () => mfa);
  const run = async payload => {
    const res = response(); let allowed = false;
    await auth({ headers: { authorization: `Bearer ${jwt.sign(payload, JWT_SECRET, { expiresIn: '1m' })}` } }, res, () => { allowed = true; });
    return { allowed, status: res.statusCode };
  };
  assert.equal((await run({ userId: id })).status, 401);
  assert.equal((await run({ userId: id, sid })).allowed, true);
  storedUser = { ...user, password: 'changed' };
  assert.equal((await run({ userId: id, sid })).status, 401);
  storedUser = user;
  mfa = { _id: id };
  assert.equal((await run({ userId: id, sid })).status, 401);
  session.mfaVerified = true;
  assert.equal((await run({ userId: id, sid })).allowed, true);
  session = null;
  assert.equal((await run({ userId: id, sid })).status, 401);
});

test('only SuperAdmin can list all users or revoke another user; current password is mandatory', async t => {
  const req = { user: { ...user, role: 'Staff', comparePassword: async () => false }, query: { scope: 'all' }, params: { id: otherId }, body: { password: 'wrong', reason: 'Incident response' } };
  let res = response();
  await handler('/sessions', 'get')(req, res);
  assert.equal(res.statusCode, 403);
  res = response();
  await handler('/users/:id/revoke-all', 'post')(req, res);
  assert.equal(res.statusCode, 403);
  t.mock.method(AuthSession, 'findOne', async filter => { assert.equal(filter.userId, id); return null; });
  res = response();
  await handler('/sessions/:id/revoke', 'post')(req, res);
  assert.equal(res.statusCode, 404);
  res = response();
  req.user.role = 'SuperAdmin';
  await handler('/users/:id/revoke-all', 'post')(req, res);
  assert.equal(res.statusCode, 403);
});

test('secret encryption is authenticated, TOTP validates current codes, and recovery codes are high entropy', t => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = '12'.repeat(32);
  t.after(() => { if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous; });
  const totp = createTotp();
  const encrypted = encryptSecret(totp.secret.base32);
  assert.equal(decryptSecret(encrypted), totp.secret.base32);
  assert.notEqual(encrypted, encryptSecret(totp.secret.base32));
  const parts = encrypted.split(':'); parts[2] = (parts[2].startsWith('00') ? 'ff' : '00') + parts[2].slice(2);
  assert.throws(() => decryptSecret(parts.join(':')));
  const now = 1750000000000;
  assert.equal(validCounter(totp.secret.base32, totp.generate({ timestamp: now }), now), Math.floor(now / 30000));
  assert.equal(validCounter(totp.secret.base32, '1', now), null);
  assert.equal(validCounter(totp.secret.base32, '1234567', now), null);
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every(code => /^[a-f0-9]{32}$/.test(code) && recoveryHash(code).length === 64));
});

test('MFA attempts reserve a database slot and recovery consumption is atomic', async t => {
  let consumed = false;
  t.mock.method(MfaCredential, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.failures.$lt, 5);
    assert.equal(filter.enabled, true);
    assert.equal(update.$inc.failures, 1);
    return { _id: sid };
  });
  t.mock.method(MfaCredential, 'updateOne', async (filter, update) => {
    if (update.$pull) {
      assert.equal(filter.recoveryHashes, recoveryHash('a'.repeat(32)));
      if (consumed) return { modifiedCount: 0 };
      consumed = true;
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  });
  assert.equal(await consumeMfaCode(id, 'a'.repeat(32)), true);
  assert.equal(await consumeMfaCode(id, 'a'.repeat(32)), false);
});

test('user serialization never exposes passwords, reset tokens or session versions', () => {
  const serialized = new User({ name: 'Test', email: 'test@example.invalid', password: 'secret', resetPasswordToken: 'secret', resetPasswordExpires: new Date(), sessionVersion: 4 }).toJSON();
  for (const key of ['password', 'resetPasswordToken', 'resetPasswordExpires', 'sessionVersion']) assert.equal(serialized[key], undefined);
});
