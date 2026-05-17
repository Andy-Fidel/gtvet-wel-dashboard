import mongoose from 'mongoose';

const placementSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  trackingId: String,
  academicYear: { type: String, default: '' },
  companyName: { type: String, required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  sector: { type: String, required: true },
  location: { type: String, required: true },
  supervisorName: String,
  supervisorPhone: String,
  supervisorEmail: String,
  partnerSupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startDate: Date,
  endDate: Date,
  status: { 
    type: String, 
    enum: ['Active', 'Completed', 'Terminated'], 
    default: 'Active'
  },
  closedAt: { type: Date },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closureReason: { type: String, trim: true },
  closureNote: { type: String, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  institution: { type: String, required: true },
  coordinates: {
    lat: Number,
    lng: Number,
  },

  // Cross-region monitoring delegation
  placementRegion: { type: String },
  delegate: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  delegatedAt: { type: Date },
  delegatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  delegateInstitution: { type: String },
}, { timestamps: true });

// Add indexes for quick querying and trend aggregation
placementSchema.index({ learner: 1 });
placementSchema.index({ learner: 1, academicYear: 1 });
placementSchema.index({ institution: 1 });
placementSchema.index({ owner: 1 });
placementSchema.index({ partnerSupervisor: 1 });
placementSchema.index({ status: 1 });
placementSchema.index({ endDate: 1, status: 1 });
placementSchema.index({ trackingId: 1 }, { unique: true, sparse: true });
placementSchema.index({ createdAt: 1 });
placementSchema.index({ delegate: 1 });

export const Placement = mongoose.model('Placement', placementSchema);
