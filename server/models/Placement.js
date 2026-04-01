import mongoose from 'mongoose';

const placementSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  trackingId: String,
  companyName: { type: String, required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  sector: { type: String, required: true },
  location: { type: String, required: true },
  supervisorName: String,
  supervisorPhone: String,
  supervisorEmail: String,
  startDate: Date,
  endDate: Date,
  status: { 
    type: String, 
    enum: ['Active', 'Completed', 'Terminated'], 
    default: 'Active'
  },
  institution: { type: String, required: true },
  coordinates: {
    lat: Number,
    lng: Number,
  },
}, { timestamps: true });

// Add indexes for quick querying and trend aggregation
placementSchema.index({ learner: 1 });
placementSchema.index({ institution: 1 });
placementSchema.index({ status: 1 });
placementSchema.index({ endDate: 1, status: 1 });
placementSchema.index({ trackingId: 1 }, { unique: true, sparse: true });
placementSchema.index({ createdAt: 1 });

export const Placement = mongoose.model('Placement', placementSchema);
