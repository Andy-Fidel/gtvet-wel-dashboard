import mongoose from 'mongoose';

const monitoringVisitSchema = new mongoose.Schema({
  visitDate: { type: Date, required: true },
  visitorPosition: String,
  visitType: { type: String, enum: ['Routine', 'Urgent', 'Follow-up'] },
  attendanceStatus: { type: String, enum: ['Present', 'Absent', 'Excused'] },
  performanceRating: { type: Number, min: 1, max: 5 },
  keyObservations: String,
  issuesIdentified: String,
  actionRequired: String,
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
  institution: { type: String, required: true },
}, { timestamps: true });

export const MonitoringVisit = mongoose.model('MonitoringVisit', monitoringVisitSchema);
