import mongoose from 'mongoose';
import crypto from 'crypto';

const learnerSchema = new mongoose.Schema({
  lastName: { type: String, required: true },
  firstName: { type: String, required: true },
  middleName: { type: String, default: '' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  phone: String,
  guardianContact: String,
  indexNumber: { type: String, required: true },
  trackingId: { type: String, unique: true },
  institution: { type: String, required: true },
  program: { type: String, required: true },
  year: { type: String, required: true },
  region: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Pending', 'Placed', 'Completed', 'Dropped'], 
    default: 'Pending' 
  },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  profilePicture: { type: String, default: '' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual "name" field for backward compatibility
learnerSchema.virtual('name').get(function() {
  const parts = [this.lastName, this.firstName];
  if (this.middleName) parts.splice(1, 0, this.middleName);
  return parts.join(' ');
});

// Add indexes for efficient aggregation & querying
learnerSchema.index({ institution: 1 });
learnerSchema.index({ status: 1 });
learnerSchema.index({ gender: 1 });
learnerSchema.index({ program: 1 });
learnerSchema.index({ createdAt: 1 });

// Auto-generate trackingId before saving
learnerSchema.pre('save', async function() {
  if (!this.trackingId) {
    const year = new Date().getFullYear();
    const isProd = process.env.NODE_ENV === 'production';
    // Use crypto for un-seeded secure random IDs
    const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.trackingId = `WEL-${year}-${randomStr}`;
  }
});

export const Learner = mongoose.model('Learner', learnerSchema);
