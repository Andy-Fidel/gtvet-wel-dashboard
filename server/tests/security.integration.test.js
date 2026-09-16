import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import authRoutes from '../routes/authRoutes.js';
import { csrfProtection } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { createTotp } from '../utils/mfa.js';
import '../models/IndustryPartner.js';
import '../models/Learner.js';

test('real MongoDB and HTTP: login, revoke, MFA enrollment/replay/recovery, password invalidation', { skip: process.env.SECURITY_MONGO_INTEGRATION !== '1' }, async () => {
  const database = `wel_security_qa_${Date.now()}`;
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  await mongoose.connect(`mongodb://127.0.0.1:27031/${database}`, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await Promise.all([User.init(), AuthSession.init(), MfaCredential.init()]);
    const account = await User.create({ name: 'Security QA', email: 'security@example.invalid', password: 'Strong-QA-password-1', role: 'SuperAdmin', passwordChangeRequired: false });
    const staff = await User.create({ name: 'Staff QA', email: 'staff@example.invalid', password: 'Strong-QA-password-1', role: 'Staff', institution: 'QA', passwordChangeRequired: false });
    const app = express();
    app.use(express.json()); app.use(csrfProtection); app.use('/api/auth', authRoutes);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const client = () => {
      const cookies = new Map();
      return async (path, method = 'GET', body) => {
        const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': cookies.get('gtvets_csrf') || '' }, body: body ? JSON.stringify(body) : undefined });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1));
        }
        return { status: response.status, data: await response.json() };
      };
    };
    const first = client(), second = client(), third = client();
    for (const request of [first, second, third]) await request('/csrf');
    const login = { email: account.email, password: 'Strong-QA-password-1' };
    assert.equal((await first('/login', 'POST', login)).status, 200);
    assert.equal((await second('/login', 'POST', login)).status, 200);
    const sessions = await first('/security/sessions');
    assert.equal(sessions.data.total, 2);
    assert.ok(sessions.data.sessions.every(item => !item.credentialVersion));
    const other = sessions.data.sessions.find(item => !item.current);
    assert.equal((await first(`/security/sessions/${other._id}/revoke`, 'POST', { password: login.password, reason: 'QA forced sign-out' })).status, 200);
    assert.equal((await second('/me')).status, 401);
    assert.equal((await third('/login', 'POST', { ...login, email: staff.email })).status, 200);
    assert.equal((await third('/security/sessions?scope=all')).status, 403);
    assert.equal((await third(`/security/users/${account._id}/revoke-all`, 'POST', { password: login.password, reason: 'Unauthorized QA' })).status, 403);
    const setup = await first('/security/mfa/setup', 'POST', { password: login.password });
    assert.equal(setup.status, 200);
    const totp = createTotp(setup.data.secret);
    const token = totp.generate();
    const enrollment = await first('/security/mfa/enable', 'POST', { code: token });
    assert.equal(enrollment.status, 200);
    assert.equal(enrollment.data.recoveryCodes.length, 8);
    assert.equal((await second('/login', 'POST', login)).status, 401);
    assert.equal((await second('/login', 'POST', { ...login, mfaCode: token })).status, 401, 'Enrollment code cannot be replayed');
    const nextToken = totp.generate({ timestamp: Date.now() + 30000 });
    assert.equal((await second('/login', 'POST', { ...login, mfaCode: nextToken })).status, 200, 'A fresh authenticator code is accepted');
    assert.equal((await second('/login', 'POST', { ...login, mfaCode: nextToken })).status, 401, 'A login code cannot be replayed');
    const recovery = enrollment.data.recoveryCodes[0];
    const attempts = await Promise.all([second('/login', 'POST', { ...login, mfaCode: recovery }), clientWithCsrf(login, recovery)]);
    async function clientWithCsrf(credentials, mfaCode) { const request = client(); await request('/csrf'); return request('/login', 'POST', { ...credentials, mfaCode }); }
    assert.deepEqual(attempts.map(item => item.status).sort(), [200, 401], 'Concurrent recovery reuse allows only one login');
    assert.equal((await first('/me')).status, 200);
    assert.equal((await first('/change-password', 'POST', { currentPassword: login.password, newPassword: 'Strong-QA-password-2' })).status, 200);
    assert.equal((await first('/me')).status, 200, 'Password change rotates the current session');
    assert.equal((await second('/me')).status, 401);
    assert.equal((await first('/security/mfa/disable', 'POST', { password: 'Strong-QA-password-2', code: enrollment.data.recoveryCodes[1] })).status, 200);
    assert.equal((await first('/me')).status, 401);
    assert.equal((await first('/login', 'POST', { ...login, password: 'Strong-QA-password-2' })).status, 200);
    assert.equal((await first(`/security/users/${account._id}/revoke-all`, 'POST', { password: 'Strong-QA-password-2', reason: 'QA all-device revocation' })).status, 200);
    assert.equal((await first('/me')).status, 401);
    assert.equal((await first('/login', 'POST', { ...login, password: 'Strong-QA-password-2' })).status, 200, 'Login remains possible after version increment');
    await User.updateOne({ _id: account._id }, { $set: { role: 'HQStaff', hqScopeType: 'National' } });
    assert.equal((await first('/me')).status, 401, 'Scope changes invalidate existing sessions');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});
