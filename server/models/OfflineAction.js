import mongoose from 'mongoose';

// No expiry: removing receipts would allow an old browser queue to repeat a write.
const schema = new mongoose.Schema({
  _id: String,
  fingerprint: { type: String, required: true },
  scope: { type: String, required: true },
  status: { type: String, enum: ['pending', 'complete', 'uncertain'], default: 'pending' },
  responseStatus: Number,
  responseBody: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

export const OfflineAction = mongoose.model('OfflineAction', schema);
