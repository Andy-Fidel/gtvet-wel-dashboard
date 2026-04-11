import mongoose from 'mongoose';

const guardianConsentSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement', required: true },
  institution: { type: String, required: true },
  academicYear: { type: String, default: '' },
  learnerSnapshot: {
    fullName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    program: { type: String, default: '' },
  },
  placementSnapshot: {
    industryName: { type: String, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  learnerDeclaration: {
    understandsProgram: { type: Boolean, default: false },
    followRules: { type: Boolean, default: false },
    respectfulResponsible: { type: Boolean, default: false },
    reportProblems: { type: Boolean, default: false },
  },
  guardianDetails: {
    fullName: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    relationshipToLearner: { type: String, required: true, trim: true },
    signatureName: { type: String, required: true, trim: true },
  },
  signedAt: { type: Date, default: Date.now },
  signedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

guardianConsentSchema.index({ learner: 1, placement: 1 }, { unique: true });
guardianConsentSchema.index({ signedByUser: 1, signedAt: -1 });

export const GuardianConsent = mongoose.model('GuardianConsent', guardianConsentSchema);
