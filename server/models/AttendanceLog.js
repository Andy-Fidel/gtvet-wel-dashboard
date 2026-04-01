import mongoose from 'mongoose';

const attendanceLogSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement', required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  institution: { type: String, required: true },
  entryType: {
    type: String,
    enum: ['Daily', 'Weekly'],
    required: true,
  },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  hoursWorked: { type: Number, required: true, min: 0 },
  tasksCompleted: { type: String, required: true },
  notes: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Pending', 'SignedOff', 'Rejected'],
    default: 'Pending',
  },
  supervisorComment: { type: String, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signedOffBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  signedOffAt: { type: Date },
}, { timestamps: true });

attendanceLogSchema.index({ learner: 1, periodStart: -1 });
attendanceLogSchema.index({ placement: 1, periodStart: -1 });
attendanceLogSchema.index({ partner: 1, status: 1 });
attendanceLogSchema.index({ institution: 1, status: 1 });

export const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);
