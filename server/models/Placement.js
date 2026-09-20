import mongoose from 'mongoose';
import { normalizeCoordinates } from '../utils/workplaceCoordinates.js';

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
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  workflowVersion: { type: Number, default: 0 },
  previousPlacement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  replacementPlacement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  institution: { type: String, required: true },
  coordinates: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
  },

  // Cross-region monitoring delegation
  placementRegion: { type: String, trim: true },
  delegate: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  delegatedAt: { type: Date },
  delegatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  delegateInstitution: { type: String },
}, { timestamps: true, autoIndex: false });

// Add indexes for quick querying and trend aggregation
placementSchema.pre('validate', function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate('endDate', 'Placement end date cannot be before start date');
  try {
    normalizeCoordinates(this.coordinates, this.status === 'Active' && (this.isNew || this.isModified('status') || this.isModified('coordinates')));
  } catch (error) { this.invalidate('coordinates', error.message); }
});
placementSchema.index({ learner: 1 });
// Installed explicitly after the read-only duplicate audit, never on app startup.
placementSchema.index({ learner: 1 }, { name: 'one_active_placement_per_learner', unique: true, partialFilterExpression: { status: 'Active' } });
placementSchema.index({ learner: 1, academicYear: 1 });
placementSchema.index({ institution: 1 });
placementSchema.index({ owner: 1 });
placementSchema.index({ partnerSupervisor: 1 });
placementSchema.index({ status: 1 });
placementSchema.index({ endDate: 1, status: 1 });
placementSchema.index({ trackingId: 1 }, { unique: true, sparse: true });
placementSchema.index({ createdAt: 1 });
placementSchema.index({ delegate: 1 });
placementSchema.index({ placementRegion: 1 });

export const Placement = mongoose.model('Placement', placementSchema);
