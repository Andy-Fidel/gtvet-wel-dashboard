import mongoose from 'mongoose';

const placementSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  trackingId: String,
  companyName: { type: String, required: true },
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
}, { timestamps: true });

export const Placement = mongoose.model('Placement', placementSchema);
