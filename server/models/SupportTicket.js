import mongoose from 'mongoose';

const supportReplySchema = new mongoose.Schema({
  message: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  createdByRole: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Technical', 'Access', 'Data', 'Workflow', 'Training', 'Other'],
    default: 'Other',
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
  },
  description: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['Open', 'InProgress', 'Resolved', 'Closed'],
    default: 'Open',
  },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institution: { type: String, default: 'N/A' },
  region: { type: String, default: '' },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  requesterRole: { type: String, required: true },
  replies: { type: [supportReplySchema], default: [] },
}, { timestamps: true });

supportTicketSchema.index({ requester: 1, createdAt: -1 });
supportTicketSchema.index({ institution: 1, status: 1 });
supportTicketSchema.index({ region: 1, status: 1 });
supportTicketSchema.index({ partnerId: 1, status: 1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
