import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: ['system', 'placement', 'visit', 'assessment', 'report', 'partner', 'support'], 
    default: 'system' 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  dismissedAt: { type: Date, default: null },
  visibleInApp: { type: Boolean, default: true },
  deliveryChannels: [{
    type: String,
    enum: ['inApp', 'whatsApp', 'push'],
  }],
  pushSentAt: { type: Date },
  pushStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
  },
  pushError: { type: String },
  whatsAppSentAt: { type: Date },
  whatsAppStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
  },
  whatsAppError: { type: String },
  link: { type: String }, // frontend route to redirect to
  dedupeKey: { type: String, index: true },
  // Added separately from dedupeKey so legacy duplicate records do not block the index.
  dedupeIdentity: { type: String },
  pushAttempts: { type: Number, default: 0 },
  pushNextAttemptAt: { type: Date },
  pushLockedUntil: { type: Date },
  whatsAppAttempts: { type: Number, default: 0 },
  whatsAppNextAttemptAt: { type: Date },
  whatsAppLockedUntil: { type: Date },
  archivedAt: { type: Date, default: null, index: true },
  archiveReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});

NotificationSchema.index({ dedupeIdentity: 1 }, { unique: true, partialFilterExpression: { dedupeIdentity: { $type: 'string' } } });
NotificationSchema.index({ recipient: 1, archivedAt: 1, _id: -1 });
NotificationSchema.index({ recipient: 1, archivedAt: 1, dismissedAt: 1, _id: -1 });
NotificationSchema.index({ pushStatus: 1, pushNextAttemptAt: 1 });
NotificationSchema.index({ whatsAppStatus: 1, whatsAppNextAttemptAt: 1 });

export const Notification = mongoose.model('Notification', NotificationSchema);
