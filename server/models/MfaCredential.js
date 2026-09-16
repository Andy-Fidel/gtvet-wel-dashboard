import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  secret: { type: String, required: true },
  pendingUntil: Date,
  lastCounter: { type: Number, default: -1 },
  recoveryHashes: { type: [String], default: [] },
  failures: { type: Number, default: 0 },
  lockedUntil: Date,
}, { timestamps: true });
export const MfaCredential = mongoose.model('MfaCredential', schema);
