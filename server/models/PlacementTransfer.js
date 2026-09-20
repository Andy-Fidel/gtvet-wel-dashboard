import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement', required: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  institution: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 2000 },
  effectiveDate: { type: Date, required: true },
  destination: { type: mongoose.Schema.Types.Mixed, required: true },
  sourceRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementRequest' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: String,
  status: { type: String, enum: ['Pending', 'Scheduled', 'Applied', 'Rejected', 'Cancelled'], default: 'Pending' },
  replacement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  sourceVersion: { type: Number, default: 0 },
  workflowVersion: { type: Number, default: 0 },
  lastError: String,
}, { timestamps: true });
schema.index({ institution: 1, status: 1 });
schema.index({ status: 1, effectiveDate: 1 });
export const PlacementTransfer = mongoose.model('PlacementTransfer', schema);
