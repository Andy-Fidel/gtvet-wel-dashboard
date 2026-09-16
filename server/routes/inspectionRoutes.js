import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { auth, JWT_SECRET, setSessionCookies, clearSessionCookies } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { AuditLog } from '../models/AuditLog.js';
import { credentialVersion } from '../utils/authSessions.js';
import { inspectionParent } from '../utils/inspection.js';

const router = express.Router();
const returnCookie = 'gtvets_inspection_return';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/inspection' });

async function record(req, actor, targetId, sessionId, summary, metadata = {}) {
  // Fail closed: do not issue an inspection session without its audit record.
  await AuditLog.create({ action: 'AUTH', entityType: 'UserInspection', entityId: String(targetId), actorId: actor._id, actorName: actor.name, actorRole: actor.role, institution: actor.institution || 'HQ', route: req.originalUrl, method: req.method, ipAddress: req.ip, summary, metadata: { ...metadata, inspectionSessionId: String(sessionId), targetUserId: String(targetId), readOnly: true } });
}

router.post('/start', auth, async (req, res) => {
  if (req.user.role !== 'SuperAdmin' || req.authSession.parentSessionId) return res.status(403).json({ message: 'Only Super Admin can start an inspection.' });
  const { userId, password, reason } = req.body || {};
  if (!mongoose.isObjectIdOrHexString(userId)) return res.status(400).json({ message: 'Select a valid user.' });
  if (typeof password !== 'string' || password.length > 256 || !(await req.user.comparePassword(password))) return res.status(403).json({ message: 'Your current Super Admin password is required.' });
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 500) return res.status(400).json({ message: 'Provide an inspection reason between 10 and 500 characters.' });
  const target = await User.findById(userId).select('+sessionVersion').populate('partnerId').populate('linkedLearners', '_id');
  if (!target || target.status !== 'Active' || target.role === 'SuperAdmin') return res.status(400).json({ message: 'Choose an active, non-SuperAdmin account.' });
  const expiresAt = new Date(Math.min(Date.now() + 15 * 60000, new Date(req.authSession.expiresAt).getTime()));
  const session = await AuthSession.create({ userId: target._id, credentialVersion: credentialVersion(target), parentSessionId: req.authSession._id, inspectorId: req.user._id, inspectionReason: reason.trim(), expiresAt, lastSeenAt: new Date(), ipAddress: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 500) });
  await record(req, req.user, target._id, session._id, `Started read-only inspection of ${target.name}`, { reason: reason.trim(), expiresAt });
  const token = jwt.sign({ userId: target._id, sid: String(session._id), inspection: true, exp: Math.floor(expiresAt.getTime() / 1000) }, JWT_SECRET, { algorithm: 'HS256' });
  const back = jwt.sign({ inspectorId: String(req.user._id), parentSessionId: String(req.authSession._id), inspectionSessionId: String(session._id), targetUserId: String(target._id), exp: Math.floor(new Date(req.authSession.expiresAt).getTime() / 1000) }, JWT_SECRET, { algorithm: 'HS256', audience: 'inspection-return' });
  res.cookie(returnCookie, back, { ...cookieOptions(), expires: new Date(req.authSession.expiresAt) });
  setSessionCookies(res, token);
  res.set('Cache-Control', 'no-store').json({ message: 'Read-only inspection started.', expiresAt });
});

// A separate, path-restricted HttpOnly cookie permits returning even after inspection expires.
router.post('/stop', async (req, res) => {
  const raw = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${returnCookie}=`));
  let decoded;
  try {
    decoded = jwt.verify(decodeURIComponent(raw?.slice(returnCookie.length + 1) || ''), JWT_SECRET, { algorithms: ['HS256'], audience: 'inspection-return' });
  } catch {
    clearSessionCookies(res); res.clearCookie(returnCookie, cookieOptions());
    return res.status(401).json({ message: 'Unable to restore your session. Sign in as Super Admin again.' });
  }
  const parent = await inspectionParent(decoded.parentSessionId, decoded.inspectorId);
  if (!parent) {
    clearSessionCookies(res); res.clearCookie(returnCookie, cookieOptions());
    return res.status(401).json({ message: 'Your Super Admin session is no longer valid. Sign in again.' });
  }
  const session = await AuthSession.findOne({ _id: decoded.inspectionSessionId, parentSessionId: parent.session._id, inspectorId: parent.user._id });
  if (session) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedBy: parent.user._id, reason: 'Inspection ended' } });
  }
  await record(req, parent.user, session?.userId || decoded.targetUserId, decoded.inspectionSessionId, 'Ended read-only user inspection', { reason: session?.inspectionReason || 'Returned after inspection expired' });
  const token = jwt.sign({ userId: parent.user._id, sid: String(parent.session._id), exp: Math.floor(new Date(parent.session.expiresAt).getTime() / 1000) }, JWT_SECRET, { algorithm: 'HS256' });
  res.clearCookie(returnCookie, cookieOptions());
  setSessionCookies(res, token);
  res.set('Cache-Control', 'no-store').json({ message: 'Returned to Super Admin.' });
});

export default router;
