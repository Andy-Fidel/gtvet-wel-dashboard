import mongoose from 'mongoose';

const exceptionSchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner' },
  learnerName: { type: String, default: '' },
  trackingId: { type: String, default: '' },
  reasons: [String],
}, { _id: false });

const semesterReportSchema = new mongoose.Schema({
  institution: { type: String, required: true },
  semester: { type: String, required: true },
  academicYear: { type: String, required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  academicTerm: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm' },
  status: {
    type: String,
    enum: ['Generated', 'Draft', 'Certified', 'Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected'],
    default: 'Draft'
  },
  reviewedByRegional: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByHQ: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regionalComment: String,
  hqComment: String,

  // Auto-generated summary (kept for backward compat with old reports)
  summary: {
    totalLearners: { type: Number, default: 0 },
    currentEnrolled: { type: Number, default: 0 },
    academicActive: { type: Number, default: 0 },
    academicGraduating: { type: Number, default: 0 },
    academicGraduated: { type: Number, default: 0 },
    academicDropped: { type: Number, default: 0 },
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
  },

  // Extended metrics for term closure
  metrics: {
    placementRate: { type: Number, default: 0 },
    avgHealthScore: { type: Number, default: 0 },
    attendanceLogCount: { type: Number, default: 0 },
    totalHoursLogged: { type: Number, default: 0 },
    avgHoursPerLearner: { type: Number, default: 0 },
    visitCoverage: { type: Number, default: 0 },
    assessmentCoverage: { type: Number, default: 0 },
    ticketsOpened: { type: Number, default: 0 },
    ticketsResolved: { type: Number, default: 0 },
    ticketResolutionRate: { type: Number, default: 0 },
  },

  // Exception list
  exceptions: { type: [exceptionSchema], default: [] },

  // Institution commentary
  commentary: {
    challenges: { type: String, default: '' },
    highlights: { type: String, default: '' },
    recommendations: { type: String, default: '' },
  },

  // Certification
  certifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  certifiedAt: { type: Date },
}, { timestamps: true });

// Indexes for efficient lookups
semesterReportSchema.index({ institution: 1, academicYear: 1, semester: 1 });
semesterReportSchema.index({ status: 1 });
semesterReportSchema.index({ createdAt: -1 });
semesterReportSchema.index({ academicTerm: 1 });

export const SemesterReport = mongoose.model('SemesterReport', semesterReportSchema);
