import mongoose from 'mongoose';

const employerEvaluationSchema = new mongoose.Schema({
    learner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Learner',
        required: true
    },
    partner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IndustryPartner',
        required: true
    },
    evaluatorName: { type: String, required: true },
    evaluatorPosition: { type: String, required: true },
    evaluationDate: { type: Date, default: Date.now },
    metrics: {
        punctualityAndAttendance: { type: Number, min: 1, max: 5, required: true },
        technicalSkills: { type: Number, min: 1, max: 5, required: true },
        abilityToLearn: { type: Number, min: 1, max: 5, required: true },
        teamworkAndCommunication: { type: Number, min: 1, max: 5, required: true },
        initiativeAndProblemSolving: { type: Number, min: 1, max: 5, required: true },
    },
    overallScore: { type: Number, min: 1, max: 5, required: true },
    strengths: { type: String, required: true },
    areasForImprovement: { type: String, required: true },
    wouldHire: { type: Boolean, required: true },
    additionalComments: { type: String }
}, { timestamps: true });

export const EmployerEvaluation = mongoose.model('EmployerEvaluation', employerEvaluationSchema);
