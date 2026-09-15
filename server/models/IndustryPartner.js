import mongoose from 'mongoose';

const industryPartnerSchema = new mongoose.Schema({
  workflowVersion: { type: Number, default: 0 },
  name: { type: String, required: true, unique: true, trim: true },
  sector: { type: String, required: true },
  region: { type: String, required: true },
  district: { type: String },
  tradeArea: { type: String },
  town: { type: String },
  location: { type: String },
  coordinates: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
  contactPerson: { type: String },
  contactPhone: { type: String },
  contactEmail: { type: String },
  website: { type: String },
  totalSlots: { type: Number, default: 0 },
  usedSlots: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  approvalStatus: {
    type: String,
    enum: ['PendingHQApproval', 'Approved', 'Rejected'],
    default: 'PendingHQApproval'
  },
  approvalRequestedAt: { type: Date },
  approvalReviewedAt: { type: Date },
  approvalReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalComment: { type: String, default: '' },
  programs: [{ type: String }],
  mouDocumentUrl: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  linkedInstitutions: [{ type: String }],
}, { timestamps: true });

industryPartnerSchema.index({ region: 1 });
// Enforces case-insensitive uniqueness atomically across all registration paths.
industryPartnerSchema.index({ name: 1 }, { name: 'partner_name_ci_unique', unique: true, collation: { locale: 'en', strength: 2 } });
industryPartnerSchema.index({ sector: 1 });
industryPartnerSchema.index({ status: 1 });
industryPartnerSchema.index({ approvalStatus: 1 });

export const IndustryPartner = mongoose.model('IndustryPartner', industryPartnerSchema);
