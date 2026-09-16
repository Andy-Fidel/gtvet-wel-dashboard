import express from 'express';
import mongoose from 'mongoose';
import { auth, clearSessionCookies } from '../middleware/auth.js';
import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { logAuditEvent } from '../utils/audit.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { mfaConfigured, createTotp, encryptSecret, decryptSecret, validCounter, newRecoveryCodes, recoveryHash, consumeMfaCode } from '../utils/mfa.js';

const router = express.Router();
router.use(auth);
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/mfa', async (req, res) => {
  const credential = await MfaCredential.findOne({ userId: req.user._id }).select('enabled recoveryHashes');
  res.json({ configured: mfaConfigured(), enabled: Boolean(credential?.enabled), recoveryCodesRemaining: credential?.recoveryHashes.length || 0 });
});

router.post('/mfa/setup', async (req, res) => {
  if (!mfaConfigured()) return res.status(503).json({ message: 'An administrator must configure the MFA encryption key before enrollment.' });
  if (typeof req.body.password !== 'string' || !(await req.user.comparePassword(req.body.password))) return res.status(403).json({ message: 'Your current password is required.' });
  const totp = createTotp(null, req.user.email);
  try {
    await MfaCredential.findOneAndUpdate({ userId: req.user._id, enabled: false }, { $set: { secret: encryptSecret(totp.secret.base32), pendingUntil: new Date(Date.now() + 10 * 60000), failures: 0, lastCounter: -1 } }, { upsert: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'MFA is already enabled. Disable it before enrolling a new device.' });
    throw error;
  }
  // Manual authenticator setup avoids sending the secret to any external QR service.
  res.json({ secret: totp.secret.base32, issuer: 'GTVETS WEL', account: req.user.email });
});

router.post('/mfa/enable', async (req, res) => {
  const credential = await MfaCredential.findOneAndUpdate({ userId: req.user._id, enabled: false, pendingUntil: { $gt: new Date() }, failures: { $lt: 5 } }, { $inc: { failures: 1 } }, { returnDocument: 'after' });
  if (!credential) return res.status(400).json({ message: 'Restart MFA setup; it expired or has too many failed attempts.' });
  const counter = validCounter(decryptSecret(credential.secret), req.body.code);
  if (counter === null) return res.status(400).json({ message: 'Invalid authenticator code.' });
  const codes = newRecoveryCodes();
  const updated = await MfaCredential.updateOne({ _id: credential._id, secret: credential.secret, enabled: false }, { $set: { enabled: true, lastCounter: counter, recoveryHashes: codes.map(recoveryHash), failures: 0 }, $unset: { pendingUntil: 1, lockedUntil: 1 } });
  if (updated.modifiedCount !== 1) return res.status(409).json({ message: 'Enrollment changed; refresh and try again.' });
  await AuthSession.updateOne({ _id: req.authSession._id }, { $set: { mfaVerified: true } });
  await AuthSession.updateMany({ userId: req.user._id, _id: { $ne: req.authSession._id }, revokedAt: null }, { $set: { revokedAt: new Date(), reason: 'MFA enabled' } });
  await logAuditEvent({ req, action: 'AUTH', entityType: 'User', entityId: req.user._id, summary: 'MFA enabled; other sessions revoked' });
  res.json({ recoveryCodes: codes });
});

router.post('/mfa/disable', async (req, res) => {
  if (typeof req.body.password !== 'string' || !(await req.user.comparePassword(req.body.password))) return res.status(403).json({ message: 'Your current password is required.' });
  if (!(await consumeMfaCode(req.user._id, req.body.code))) return res.status(403).json({ message: 'Invalid or previously used code. After repeated failures, wait 10 minutes.' });
  await User.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 } });
  await MfaCredential.deleteOne({ userId: req.user._id });
  await AuthSession.updateMany({ userId: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date(), reason: 'MFA disabled' } });
  await logAuditEvent({ req, action: 'AUTH', entityType: 'User', entityId: req.user._id, summary: 'MFA disabled; all sessions revoked' });
  clearSessionCookies(res);
  res.json({ message: 'MFA disabled. Sign in again.' });
});

router.get('/sessions', async (req, res) => {
  const all = req.query.scope === 'all';
  if (all && req.user.role !== 'SuperAdmin') return res.status(403).json({ message: 'Super Admin access required.' });
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const filter = { revokedAt: null, expiresAt: { $gt: new Date() }, ...(all ? {} : { userId: req.user._id }) };
  const [sessions, total] = await Promise.all([
    AuthSession.find(filter).select('-credentialVersion').populate('userId', 'name email role status institution').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25).lean(),
    AuthSession.countDocuments(filter),
  ]);
  res.json({ sessions: sessions.map(item => ({ ...item, current: String(item._id) === String(req.authSession._id) })), total, page, pageSize: 25 });
});

async function confirmPassword(req, res) {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 256 || !(await req.user.comparePassword(password))) {
    res.status(403).json({ message: 'Your current password is required to revoke sessions.' });
    return false;
  }
  if (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 5 || req.body.reason.length > 500) {
    res.status(400).json({ message: 'Provide a reason between 5 and 500 characters.' });
    return false;
  }
  return true;
}

router.post('/sessions/:id/revoke', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid session.' });
  const session = await AuthSession.findOne({ _id: req.params.id, ...(req.user.role === 'SuperAdmin' ? {} : { userId: req.user._id }) });
  if (!session) return res.status(404).json({ message: 'Session not found.' });
  if (!(await confirmPassword(req, res))) return;
  await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: req.user._id, reason: req.body.reason.trim() } });
  await logAuditEvent({ req, action: 'AUTH', entityType: 'AuthSession', entityId: session._id, summary: 'Session revoked', metadata: { targetUserId: String(session.userId), reason: req.body.reason.trim() } });
  const current = String(session._id) === String(req.authSession._id);
  if (current) clearSessionCookies(res);
  res.json({ message: 'Session revoked.', signedOut: current });
});

router.post('/users/:id/revoke-all', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid user.' });
  const own = String(req.user._id) === req.params.id;
  if (!own && req.user.role !== 'SuperAdmin') return res.status(403).json({ message: 'Super Admin access required.' });
  if (!(await confirmPassword(req, res))) return;
  // Version increment invalidates existing sessions even if the following bookkeeping fails.
  const target = await User.findByIdAndUpdate(req.params.id, { $inc: { sessionVersion: 1 } });
  if (!target) return res.status(404).json({ message: 'User not found.' });
  await AuthSession.updateMany({ userId: target._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: req.user._id, reason: req.body.reason.trim() } });
  await logAuditEvent({ req, action: 'AUTH', entityType: 'User', entityId: target._id, summary: 'All user sessions revoked', metadata: { reason: req.body.reason.trim() } });
  if (own) clearSessionCookies(res);
  res.json({ message: 'All sessions revoked.', signedOut: own });
});

export default router;
