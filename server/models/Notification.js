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
  visibleInApp: { type: Boolean, default: true },
  deliveryChannels: [{
    type: String,
    enum: ['inApp', 'whatsApp'],
  }],
  whatsAppSentAt: { type: Date },
  whatsAppStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
  },
  whatsAppError: { type: String },
  link: { type: String }, // frontend route to redirect to
  dedupeKey: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

export const Notification = mongoose.model('Notification', NotificationSchema);
