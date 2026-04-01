import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: ['system', 'placement', 'visit', 'assessment', 'report', 'partner'], 
    default: 'system' 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  link: { type: String }, // frontend route to redirect to
  createdAt: { type: Date, default: Date.now, index: true }
});

export const Notification = mongoose.model('Notification', NotificationSchema);
