import mongoose from 'mongoose';

const PushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  expirationTime: { type: Number, default: null },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String, default: '' },
  lastUsedAt: { type: Date, default: Date.now },
}, { timestamps: true });

PushSubscriptionSchema.index({ user: 1, updatedAt: -1 });

export const PushSubscription = mongoose.model('PushSubscription', PushSubscriptionSchema);
