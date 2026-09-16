import crypto from 'crypto';
import { Secret, TOTP } from 'otpauth';
import { MfaCredential } from '../models/MfaCredential.js';

export const mfaConfigured = () => /^[a-f\d]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || '');
function encryptionKey() {
  if (!mfaConfigured()) throw new Error('MFA encryption key is not configured');
  return Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'hex');
}
export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('hex')).join(':');
}
export function decryptSecret(value) {
  const [iv, tag, encrypted] = value.split(':').map(part => Buffer.from(part, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
export const recoveryHash = value => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
export const newRecoveryCodes = () => Array.from({ length: 8 }, () => crypto.randomBytes(16).toString('hex'));
export function createTotp(secret, email = 'WEL') {
  return new TOTP({ issuer: 'GTVETS WEL', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: secret || new Secret({ size: 20 }) });
}
export function validCounter(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
  const delta = createTotp(secret).validate({ token, window: 1, timestamp: now });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}

// Reserve a bounded attempt atomically across workers, then consume each code once.
export async function consumeMfaCode(userId, token) {
  if (typeof token !== 'string' || token.length > 64) return false;
  const now = new Date();
  await MfaCredential.updateOne({ userId, lockedUntil: { $lte: now } }, { $set: { failures: 0 }, $unset: { lockedUntil: 1 } });
  const credential = await MfaCredential.findOneAndUpdate({ userId, enabled: true, failures: { $lt: 5 }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }, { $inc: { failures: 1 } }, { returnDocument: 'after' });
  if (!credential) return false;
  await MfaCredential.updateOne({ _id: credential._id, failures: { $gte: 5 } }, { $set: { lockedUntil: new Date(Date.now() + 10 * 60000) } });
  let result;
  if (/^[a-f\d]{32}$/i.test(token.trim())) {
    result = await MfaCredential.updateOne({ _id: credential._id, enabled: true, recoveryHashes: recoveryHash(token) }, { $pull: { recoveryHashes: recoveryHash(token) }, $set: { failures: 0 }, $unset: { lockedUntil: 1 } });
  } else {
    const counter = validCounter(decryptSecret(credential.secret), token.trim());
    if (counter === null) return false;
    result = await MfaCredential.updateOne({ _id: credential._id, enabled: true, lastCounter: { $lt: counter } }, { $set: { lastCounter: counter, failures: 0 }, $unset: { lockedUntil: 1 } });
  }
  return result.modifiedCount === 1;
}
