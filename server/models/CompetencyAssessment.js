import mongoose from 'mongoose';

const competencyAssessmentSchema = new mongoose.Schema({
  assessmentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  learner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Learner',
    required: true
  },
  trackingId: {
    type: String,
  },
  assessmentType: {
    type: String,
    enum: ['Practical', 'Theoretical', 'Combined', 'On-the-job', 'Oral'],
    required: true
  },
  technicalSkills: {
    type: String,
    trim: true,
    minlength: 5,
    required: true
  },
  softSkills: {
    type: String,
    trim: true,
    minlength: 5,
    required: true
  },
  professionalism: {
    type: Number,
    validate: Number.isInteger,
    required: true,
    min: 1,
    max: 5
  },
  problemSolving: {
    type: Number,
    validate: Number.isInteger,
    required: true,
    min: 1,
    max: 5
  },
  overallScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  assessorName: {
    type: String,
    trim: true,
    minlength: 2,
    required: true
  },
  recommendations: {
    type: String
  },
  institution: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

competencyAssessmentSchema.index({ learner: 1, assessmentDate: -1 });
competencyAssessmentSchema.index({ institution: 1, assessmentDate: -1 });
competencyAssessmentSchema.index({ trackingId: 1 });

export const CompetencyAssessment = mongoose.model('CompetencyAssessment', competencyAssessmentSchema);
