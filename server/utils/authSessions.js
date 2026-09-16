import crypto from 'crypto';
import { AuthSession } from '../models/AuthSession.js';

// Password and scope changes invalidate sessions without relying on process-local caches.
export function credentialVersion(user) {
  return crypto.createHash('sha256').update(JSON.stringify([
    user.password, user.role, user.status, user.institution || '', user.region || '',
    user.hqScopeType || '', String(user.partnerId?._id || user.partnerId || ''),
    user.partnerPortalRole || '', (user.linkedLearners || []).map(item => String(item._id || item)).sort(),
    user.sessionVersion || 0,
  ])).digest('hex');
}

export async function createAuthSession(user, req, mfaVerified = false) {
  return AuthSession.create({
    userId: user._id,
    credentialVersion: credentialVersion(user),
    mfaVerified,
    ipAddress: String(req.ip || '').slice(0, 100),
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 500),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}
