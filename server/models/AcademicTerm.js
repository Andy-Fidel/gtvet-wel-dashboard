import mongoose from 'mongoose';

const academicTermSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  termType: {
    type: String,
    enum: ['Term 1', 'Term 2', 'Term 3', 'Semester 1', 'Semester 2', 'Custom'],
    default: 'Semester 1',
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['Planned', 'Active', 'Completed'],
    default: 'Planned',
  },
  isCurrent: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

academicTermSchema.index({ academicYear: 1, termType: 1 });
academicTermSchema.index({ startDate: 1, endDate: 1 });
academicTermSchema.index({ isCurrent: 1 });

export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
