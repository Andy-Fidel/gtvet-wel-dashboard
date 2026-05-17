import mongoose from 'mongoose';
import crypto from 'crypto';

const learnerSchema = new mongoose.Schema({
  lastName: { type: String, required: true },
  firstName: { type: String, required: true },
  middleName: { type: String, default: '' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  dateOfBirth: { type: Date },
  phone: String,
  guardianContact: String,
  indexNumber: { type: String, required: true },
  trackingId: { type: String, unique: true },
  institution: { type: String, required: true },
  program: { type: String, required: true },
  year: { type: String, required: true },
  intakeAcademicYear: { type: String, default: '' },
  academicStatus: {
    type: String,
    enum: ['Active', 'Graduating', 'Graduated', 'Dropped'],
    default: 'Active',
  },
  graduationAcademicYear: { type: String, default: '' },
  graduatedAt: { type: Date },
  region: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Pending', 'Placed', 'Completed', 'Dropped'], 
    default: 'Pending' 
  },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  profilePicture: { type: String, default: '' },
  progressionHistory: [{
    academicYear: { type: String, default: '' },
    action: {
      type: String,
      enum: ['Intake', 'Promoted', 'Graduated', 'Dropped', 'StatusAdjusted'],
      required: true,
    },
    fromYear: { type: String, default: '' },
    toYear: { type: String, default: '' },
    note: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual "name" field for backward compatibility
learnerSchema.virtual('name').get(function() {
  const parts = [this.lastName, this.firstName];
  if (this.middleName) parts.splice(1, 0, this.middleName);
  return parts.join(' ');
});

// Add indexes for efficient aggregation & querying
learnerSchema.index({ institution: 1 });
learnerSchema.index({ owner: 1 });
learnerSchema.index({ status: 1 });
learnerSchema.index({ academicStatus: 1 });
learnerSchema.index({ gender: 1 });
learnerSchema.index({ program: 1 });
learnerSchema.index({ year: 1 });
learnerSchema.index({ intakeAcademicYear: 1 });
learnerSchema.index({ region: 1 });
learnerSchema.index({ createdAt: 1 });
learnerSchema.index({ institution: 1, academicStatus: 1 });
learnerSchema.index({ institution: 1, status: 1 });
learnerSchema.index({ institution: 1, intakeAcademicYear: 1 });
learnerSchema.index({ institution: 1, year: 1 });
learnerSchema.index({ region: 1, intakeAcademicYear: 1 });
learnerSchema.index({ region: 1, academicStatus: 1 });

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
