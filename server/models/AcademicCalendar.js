import mongoose from 'mongoose';

const academicCalendarSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  eventType: {
    type: String,
    enum: ['Semester Start', 'Semester End', 'Exam Period', 'Holiday', 'Deadline', 'WEL Window', 'Other'],
    default: 'Other'
  },
  semester: String,        // e.g. "Semester 1", "Semester 2"
  academicYear: String,    // e.g. "2025/2026"
  institutionCalendarType: {
    type: String,
    enum: ['All', 'Single Track', 'Transitional'],
    default: 'All',
  },
  targetYearGroup: {
    type: String,
    enum: ['Year 1', 'Year 2', 'Year 3', 'All'],
    default: 'All',
  },
  totalWeeks: {
    type: Number,
    min: 1,
    default: null,
  },
  hoursPerDay: {
    type: Number,
    min: 1,
    default: null,
  },
  sourceLabel: {
    type: String,
    default: '',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

academicCalendarSchema.index({ startDate: 1 });
academicCalendarSchema.index({ eventType: 1 });
academicCalendarSchema.index({ academicYear: 1, semester: 1 });
academicCalendarSchema.index({ academicYear: 1, eventType: 1, institutionCalendarType: 1, targetYearGroup: 1 });

academicCalendarSchema.pre('validate', function (next) {
  if (this.eventType === 'WEL Window') {
    if (!this.semester) {
      this.invalidate('semester', 'Semester is required for WEL windows');
    }
    if (!this.academicYear) {
      this.invalidate('academicYear', 'Academic year is required for WEL windows');
    }
    if (!this.institutionCalendarType || this.institutionCalendarType === 'All') {
      this.invalidate('institutionCalendarType', 'Institution calendar type is required for WEL windows');
    }
    if (!this.targetYearGroup || this.targetYearGroup === 'All') {
      this.invalidate('targetYearGroup', 'Target year group is required for WEL windows');
    }
  }
  next();
});

export const AcademicCalendar = mongoose.model('AcademicCalendar', academicCalendarSchema);
