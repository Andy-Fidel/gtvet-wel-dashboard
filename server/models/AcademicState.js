import mongoose from 'mongoose';

// One atomic reference is authoritative even on a standalone MongoDB server.
const schema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  currentTerm: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null },
  completedTerms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm' }],
  lockToken: String,
  lockUntil: Date,
}, { timestamps: true });
export const AcademicState = mongoose.model('AcademicState', schema);
