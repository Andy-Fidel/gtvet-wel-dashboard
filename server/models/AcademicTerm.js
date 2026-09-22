import mongoose from 'mongoose';

const yearGroupScheduleSchema = new mongoose.Schema({
  yearGroup: {
    type: String,
    enum: ['Year 1', 'Year 2', 'Year 3'],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
}, { _id: false });

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
  yearGroupSchedules: { type: [yearGroupScheduleSchema], default: [] },
  status: {
    type: String,
    enum: ['Planned', 'Active', 'Completed'],
    default: 'Planned',
  },
  isCurrent: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  archived: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

academicTermSchema.index({ academicYear: 1, termType: 1 });
academicTermSchema.index({ startDate: 1, endDate: 1 });
academicTermSchema.index({ isCurrent: 1 });

academicTermSchema.pre('validate', function () {
  const yearGroups = ['Year 1', 'Year 2', 'Year 3'];
  if (!this.yearGroupSchedules?.length && this.startDate && this.endDate) {
    this.yearGroupSchedules = yearGroups.map(yearGroup => ({ yearGroup, startDate: this.startDate, endDate: this.endDate }));
  }
  const schedules = this.yearGroupSchedules || [];
  const uniqueGroups = new Set(schedules.map(schedule => schedule.yearGroup));
  if (schedules.length !== yearGroups.length || uniqueGroups.size !== yearGroups.length || yearGroups.some(yearGroup => !uniqueGroups.has(yearGroup))) {
    this.invalidate('yearGroupSchedules', 'Provide one schedule for each of Year 1, Year 2 and Year 3');
  }
  for (const schedule of schedules) {
    if (schedule.startDate && schedule.endDate && schedule.endDate < schedule.startDate) {
      this.invalidate('yearGroupSchedules', `${schedule.yearGroup} end date cannot be before its start date`);
    }
  }
  const validStarts = schedules.map(schedule => schedule.startDate).filter(Boolean).map(value => new Date(value));
  const validEnds = schedules.map(schedule => schedule.endDate).filter(Boolean).map(value => new Date(value));
  if (validStarts.length === yearGroups.length && validEnds.length === yearGroups.length) {
    this.startDate = new Date(Math.min(...validStarts.map(date => date.getTime())));
    this.endDate = new Date(Math.max(...validEnds.map(date => date.getTime())));
  }
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate('endDate', 'End date cannot be before start date');
  const year = /^(\d{4})\/(\d{4})$/.exec(this.academicYear || '');
  if (!year || Number(year[2]) !== Number(year[1]) + 1) this.invalidate('academicYear', 'Use consecutive years, for example 2026/2027');
});

export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
