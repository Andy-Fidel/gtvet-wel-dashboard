import mongoose from 'mongoose';

const monthlyReportSchema = new mongoose.Schema({
  weekEnding: { type: Date, required: true },
  taskCompleted: String,
  skillsPracticed: String,
  challengesFaced: String,
  supervisorComments: String,
  hoursWorked: Number,
  reportStatus: { type: String, enum: ['Draft', 'Submitted', 'Approved', 'Rejected'], default: 'Draft' },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  trackingId: String,
  institution: { type: String, required: true },
}, { timestamps: true });

export const MonthlyReport = mongoose.model('MonthlyReport', monthlyReportSchema);
