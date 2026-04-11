import mongoose from 'mongoose';

const accessApprovalSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  requestType: {
    type: String,
    enum: ['OutOfScopeChange', 'PrivilegedRoleAssignment', 'CrossRegionAccess', 'AccountRecovery', 'Other'],
    default: 'Other',
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requesterRole: { type: String, required: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  institution: { type: String, default: 'N/A' },
  region: { type: String, default: '' },
  requestedRole: { type: String, default: '' },
  requestedInstitution: { type: String, default: '' },
  requestedRegion: { type: String, default: '' },
  decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decisionComment: { type: String, default: '' },
  decidedAt: { type: Date },
  implementedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  implementedAt: { type: Date },
  implementedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

accessApprovalSchema.index({ status: 1, createdAt: -1 });
accessApprovalSchema.index({ requester: 1, createdAt: -1 });
accessApprovalSchema.index({ institution: 1, status: 1 });
accessApprovalSchema.index({ region: 1, status: 1 });

export const AccessApproval = mongoose.model('AccessApproval', accessApprovalSchema);
