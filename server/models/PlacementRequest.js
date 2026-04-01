import mongoose from 'mongoose';

const placementRequestSchema = new mongoose.Schema({
  institution: { type: String, required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner', required: true },
  learners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Learner' }],
  program: { type: String, required: true },
  requestedSlots: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected', 'Placed'],
    default: 'Submitted'
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedByRegional: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByHQ: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regionalComment: String,
  hqComment: String,
  rejectionReason: String,
  startDate: Date,
  endDate: Date,
}, { timestamps: true });

placementRequestSchema.index({ institution: 1 });
placementRequestSchema.index({ status: 1 });
placementRequestSchema.index({ partner: 1 });
placementRequestSchema.index({ createdAt: -1 });

export const PlacementRequest = mongoose.model('PlacementRequest', placementRequestSchema);
