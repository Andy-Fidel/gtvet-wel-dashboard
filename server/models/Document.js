import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true },
  fileSize: { type: Number },
  category: {
    type: String,
    enum: ['Placement Letter', 'ID Copy', 'Certificate', 'Assessment Form', 'Visit Photo', 'Report', 'MoU', 'Support Attachment', 'Incident Evidence', 'Evaluation Evidence', 'Other'],
    default: 'Other'
  },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner' },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  monitoringVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringVisit' },
  supportTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket' },
  employerEvaluation: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployerEvaluation' },
  institution: { type: String, required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
}, { timestamps: true });

documentSchema.index({ learner: 1 });
documentSchema.index({ placement: 1 });
documentSchema.index({ monitoringVisit: 1 });
documentSchema.index({ supportTicket: 1 });
documentSchema.index({ employerEvaluation: 1 });
documentSchema.index({ institution: 1 });
documentSchema.index({ partnerId: 1 });

export const Document = mongoose.model('Document', documentSchema);
