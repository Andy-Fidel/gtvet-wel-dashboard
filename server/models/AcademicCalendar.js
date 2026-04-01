import mongoose from 'mongoose';

const academicCalendarSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  eventType: {
    type: String,
    enum: ['Semester Start', 'Semester End', 'Exam Period', 'Holiday', 'Deadline', 'Other'],
    default: 'Other'
  },
  semester: String,        // e.g. "Semester 1", "Semester 2"
  academicYear: String,    // e.g. "2025/2026"
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

academicCalendarSchema.index({ startDate: 1 });
academicCalendarSchema.index({ eventType: 1 });
academicCalendarSchema.index({ academicYear: 1, semester: 1 });

export const AcademicCalendar = mongoose.model('AcademicCalendar', academicCalendarSchema);
