import mongoose from 'mongoose';

const learnerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  phone: String,
  email: { type: String, unique: true },
  indexNumber: { type: String, required: true },
  trackingId: { type: String, unique: true },
  institution: { type: String, required: true },
  program: { type: String, required: true },
  year: { type: String, required: true }, // e.g., "Year 2"
  region: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Pending', 'Placed', 'Completed', 'Dropped'], 
    default: 'Pending' 
  },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' }
}, { timestamps: true });

// Auto-generate trackingId before saving
learnerSchema.pre('save', async function() {
  if (!this.trackingId) {
    const year = new Date().getFullYear();
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.trackingId = `WEL-${year}-${randomStr}`;
  }
});

export const Learner = mongoose.model('Learner', learnerSchema);
