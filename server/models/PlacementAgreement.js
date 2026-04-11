import mongoose from 'mongoose';

const employerAcknowledgementSchema = new mongoose.Schema({
  signed: { type: Boolean, default: false },
  signerName: { type: String, default: '' },
  businessRepresentativeName: { type: String, default: '' },
  signatureName: { type: String, default: '' },
  signedAt: { type: Date },
  signedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const learnerAgreementSchema = new mongoose.Schema({
  signed: { type: Boolean, default: false },
  learnerName: { type: String, default: '' },
  signatureName: { type: String, default: '' },
  signedAt: { type: Date },
  witnessedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const placementAgreementSchema = new mongoose.Schema({
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement', required: true, unique: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  institution: { type: String, required: true },
  employerAcknowledgement: { type: employerAcknowledgementSchema, default: () => ({}) },
  learnerAgreement: { type: learnerAgreementSchema, default: () => ({}) },
}, { timestamps: true });

placementAgreementSchema.index({ learner: 1, createdAt: -1 });
placementAgreementSchema.index({ partner: 1, createdAt: -1 });

export const PlacementAgreement = mongoose.model('PlacementAgreement', placementAgreementSchema);
