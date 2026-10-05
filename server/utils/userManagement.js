import crypto from 'node:crypto';
import { UserManagementLock } from '../models/UserManagementLock.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { credentialVersion } from './authSessions.js';

const publicFields = ['_id', 'name', 'email', 'role', 'status', 'phone', 'institution', 'region', 'hqScopeType', 'partnerPortalRole', 'profilePicture', 'notificationPreferences', 'invitationSentAt', 'invitationDeliveryStatus', 'inviteAcceptedAt', 'lastLoginAt', 'passwordChangeRequired', 'createdAt', 'updatedAt'];
export const editableUserFields = ['name', 'email', 'password', 'role', 'status', 'phone', 'institution', 'region', 'hqScopeType', 'partnerId', 'partnerPortalRole', 'linkedLearners'];
export const userInput = body => Object.fromEntries(editableUserFields.filter(field => Object.hasOwn(body || {}, field)).map(field => [field, body[field]]));

export function serializeManagedUser(doc) {
  const user = doc.toObject ? doc.toObject() : doc;
  const result = Object.fromEntries(publicFields.filter(field => user[field] !== undefined).map(field => [field, user[field]]));
  if (user.partnerId) result.partnerId = user.partnerId.name !== undefined ? { _id: user.partnerId._id, name: user.partnerId.name } : user.partnerId;
  result.linkedLearners = (user.linkedLearners || []).map(learner => learner._id && learner.institution !== undefined ? {
    _id: learner._id,
    name: learner.name || [learner.lastName, learner.middleName, learner.firstName].filter(Boolean).join(' ') || learner.trackingId || 'Learner',
    trackingId: learner.trackingId,
    institution: learner.institution,
  } : learner);
  return result;
}

export const userManagementError = (message, status = 409) => Object.assign(new Error(message), { status });

export async function withUserManagementLock(work) {
  try { await UserManagementLock.updateOne({ _id: 'lifecycle' }, { $setOnInsert: { _id: 'lifecycle' } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const token = crypto.randomUUID();
  const lock = await UserManagementLock.findOneAndUpdate({ _id: 'lifecycle', $or: [{ token: { $exists: false } }, { expiresAt: { $lte: new Date() } }] },
    { $set: { token, expiresAt: new Date(Date.now() + 120000) } }, { returnDocument: 'after' }).lean();
  if (!lock) throw userManagementError('Another account or assignment update is in progress. Please retry.');
  const assertLease = async () => {
    const result = await UserManagementLock.updateOne({ _id: 'lifecycle', token, expiresAt: { $gt: new Date() } }, { $set: { expiresAt: new Date(Date.now() + 120000) } });
    if (!result.matchedCount) throw userManagementError('Account update timed out. Refresh and retry.');
  };
  // Imports may outlast the lease. Keep it alive while the process is healthy;
  // a crashed process still releases the lock through expiry.
  let renewal = Promise.resolve();
  let renewalError;
  const heartbeat = setInterval(() => {
    renewal = renewal.then(assertLease).catch(error => { renewalError = error; });
  }, 30000);
  heartbeat.unref();
  try { return await work(async () => { if (renewalError) throw renewalError; await assertLease(); }); }
  finally {
    clearInterval(heartbeat);
    await renewal;
    await UserManagementLock.updateOne({ _id: 'lifecycle', token }, { $unset: { token: 1, expiresAt: 1 } });
  }
}

export const userManagementMutation = handler => async (req, res) => {
  try { return await withUserManagementLock(async assertLease => {
    // Authentication can precede a concurrent access change. Check again after
    // acquiring the shared lock before relying on the request's actor snapshot.
    if (req.authSession) {
      const [actor, session] = await Promise.all([
        User.findById(req.user._id).select('+sessionVersion'),
        AuthSession.exists({ _id: req.authSession._id, userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
      ]);
      if (!actor || actor.status !== 'Active' || !session || credentialVersion(actor) !== req.authSession.credentialVersion)
        return res.status(401).json({ message: 'Your access changed. Please sign in again.' });
      if (actor.passwordChangeRequired)
        return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password before using the portal.' });
    }
    return handler(req, res, assertLease);
  }); }
  catch (error) {
    if (!error.status) console.error('User management mutation failed:', error);
    if (res.headersSent) return;
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to update account. Please retry.' });
  }
};

// Await the entire handler, including database work after a client disconnect.
// Releasing on response close would permit an assignment/lifecycle race.
export const userAssignmentMutation = userManagementMutation;
