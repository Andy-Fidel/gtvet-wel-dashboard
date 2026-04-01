import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'UPLOAD', 'AUTH'],
    required: true,
  },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  summary: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  institution: { type: String, default: 'N/A' },
  region: { type: String, default: '' },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  route: { type: String, default: '' },
  method: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  changedFields: { type: [String], default: [] },
  beforeData: { type: mongoose.Schema.Types.Mixed },
  afterData: { type: mongoose.Schema.Types.Mixed },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ institution: 1, createdAt: -1 });
auditLogSchema.index({ region: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

function blockAuditMutation(next) {
  next(new Error('Audit logs are immutable and cannot be modified or deleted.'));
}

auditLogSchema.pre('findOneAndUpdate', blockAuditMutation);
auditLogSchema.pre('updateOne', blockAuditMutation);
auditLogSchema.pre('updateMany', blockAuditMutation);
auditLogSchema.pre('findOneAndDelete', blockAuditMutation);
auditLogSchema.pre('deleteOne', blockAuditMutation);
auditLogSchema.pre('deleteMany', blockAuditMutation);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
