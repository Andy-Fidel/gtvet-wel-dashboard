import mongoose from 'mongoose';

const semesterReportSchema = new mongoose.Schema({
  institution: { type: String, required: true },
  semester: { type: String, required: true }, // e.g. "Semester 1", "Semester 2"
  academicYear: { type: String, required: true }, // e.g. "2025/2026"
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['Generated', 'Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected'],
    default: 'Generated'
  },
  reviewedByRegional: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByHQ: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regionalComment: String,
  hqComment: String,
  summary: {
    totalLearners: { type: Number, default: 0 },
    placed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    dropped: { type: Number, default: 0 },
    totalMonitoringVisits: { type: Number, default: 0 },
    totalCompetencyAssessments: { type: Number, default: 0 },
    programBreakdown: [{
      program: String,
      count: Number
    }]
  }
}, { timestamps: true });

// Indexes for efficient lookups
semesterReportSchema.index({ institution: 1, academicYear: 1, semester: 1 });
semesterReportSchema.index({ status: 1 });
semesterReportSchema.index({ createdAt: -1 });

export const SemesterReport = mongoose.model('SemesterReport', semesterReportSchema);
