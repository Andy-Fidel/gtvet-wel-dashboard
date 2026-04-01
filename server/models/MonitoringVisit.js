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

  // Geolocation verification
  submittedLocation: {
    lat: Number,
    lng: Number,
    accuracy: Number,  // metres from browser API
  },
  locationVerified: {
    type: String,
    enum: ['Verified', 'Unverified', 'No GPS', 'No Placement'],
    default: 'No GPS',
  },
  distanceFromSite: Number,  // metres
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
monitoringVisitSchema.index({ learner: 1, visitDate: -1 });
monitoringVisitSchema.index({ submittedBy: 1, createdAt: -1 });

export const MonitoringVisit = mongoose.model('MonitoringVisit', monitoringVisitSchema);
