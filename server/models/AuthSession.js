import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  credentialVersion: { type: String, required: true, select: false },
  mfaVerified: { type: Boolean, default: false },
  parentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthSession' },
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  inspectionReason: { type: String, maxlength: 500 },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
export const AuthSession = mongoose.model('AuthSession', schema);
