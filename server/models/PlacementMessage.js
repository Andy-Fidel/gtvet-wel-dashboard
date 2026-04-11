import mongoose from 'mongoose';

const placementMessageSchema = new mongoose.Schema({
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement', required: true, index: true },
  senderUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, required: true },
  senderInstitution: { type: String, default: '' },
  senderPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  message: { type: String, required: true, trim: true },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementMessage', default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

placementMessageSchema.index({ placement: 1, createdAt: 1 });
placementMessageSchema.index({ replyTo: 1 });

export const PlacementMessage = mongoose.model('PlacementMessage', placementMessageSchema);
