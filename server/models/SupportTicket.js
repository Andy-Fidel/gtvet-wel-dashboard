import mongoose from 'mongoose';

const supportReplySchema = new mongoose.Schema({
  message: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  createdByRole: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const supportReadStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt: { type: Date, default: Date.now },
}, { _id: false });

const supportTicketSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  ticketType: {
    type: String,
    enum: ['Support', 'Incident'],
    default: 'Support',
  },
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
  incidentType: {
    type: String,
    enum: ['AbsentLearner', 'EarlyTermination', 'SafetyIssue', 'Misconduct', 'SupervisorChanged', 'WorksiteChanged', 'Other'],
    default: undefined,
  },
  incidentDate: { type: Date },
  status: {
    type: String,
    enum: ['Open', 'InProgress', 'Resolved', 'Closed'],
    default: 'Open',
  },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastActivityBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastActivityAt: { type: Date, default: Date.now },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner' },
  placement: { type: mongoose.Schema.Types.ObjectId, ref: 'Placement' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  institution: { type: String, default: 'N/A' },
  region: { type: String, default: '' },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  requesterRole: { type: String, required: true },
  awaitingParty: {
    type: String,
    enum: ['Institution', 'Partner', 'Support', 'Requester', 'None'],
    default: 'Support',
  },
  escalationLevel: {
    type: String,
    enum: ['None', 'Regional', 'HQ'],
    default: 'None',
  },
  escalationReason: { type: String, default: '' },
  escalatedAt: { type: Date },
  firstResponseDueAt: { type: Date },
  firstRespondedAt: { type: Date },
  resolutionDueAt: { type: Date },
  resolvedAt: { type: Date },
  replies: { type: [supportReplySchema], default: [] },
  readStates: { type: [supportReadStateSchema], default: [] },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archiveReason: { type: String, default: '' },
  archivedAcademicYear: { type: String, default: '' },
}, { timestamps: true });

supportTicketSchema.index({ requester: 1, createdAt: -1 });
supportTicketSchema.index({ institution: 1, status: 1 });
supportTicketSchema.index({ region: 1, status: 1 });
supportTicketSchema.index({ partnerId: 1, status: 1 });
supportTicketSchema.index({ partnerId: 1, awaitingParty: 1, status: 1 });
supportTicketSchema.index({ ticketType: 1, incidentType: 1, status: 1 });
supportTicketSchema.index({ learner: 1, status: 1 });
supportTicketSchema.index({ placement: 1, status: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ escalatedTo: 1, status: 1 });
supportTicketSchema.index({ resolutionDueAt: 1, status: 1 });
supportTicketSchema.index({ 'readStates.user': 1 });
supportTicketSchema.index({ archivedAt: 1, institution: 1, updatedAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
