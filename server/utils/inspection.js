import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { credentialVersion } from './authSessions.js';

export async function inspectionParent(parentId, inspectorId) {
  const [session, user, mfa] = await Promise.all([
    AuthSession.findOne({ _id: parentId, userId: inspectorId, parentSessionId: null, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+credentialVersion'),
    User.findById(inspectorId).select('+sessionVersion').populate('partnerId').populate('linkedLearners', '_id'),
    MfaCredential.exists({ userId: inspectorId, enabled: true }),
  ]);
  if (!session || !user || user.role !== 'SuperAdmin' || user.status !== 'Active' || session.credentialVersion !== credentialVersion(user) || (mfa && !session.mfaVerified)) return null;
  return { session, user };
}
