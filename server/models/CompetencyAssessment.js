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
    required: true
  },
  softSkills: {
    type: String,
    required: true
  },
  professionalism: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  problemSolving: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  overallScore: {
    type: Number,
    required: true
  },
  assessorName: {
    type: String,
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

export const CompetencyAssessment = mongoose.model('CompetencyAssessment', competencyAssessmentSchema);
