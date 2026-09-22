import mongoose from 'mongoose';

const partnerChangeSchema = new mongoose.Schema({
  institution: { type: String, required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requesterName: String,
  status: { type: String, enum: ['InstitutionReview', 'HQReview', 'Returned', 'Approved', 'Rejected', 'Withdrawn'], required: true },
  version: { type: Number, default: 0 },
  original: mongoose.Schema.Types.Mixed,
  proposed: mongoose.Schema.Types.Mixed,
  reason: String,
  attachments: [{ _id: false, documentId: mongoose.Schema.Types.ObjectId, fileName: String, url: String }],
  history: [{ _id: false, action: String, actor: mongoose.Schema.Types.ObjectId, actorName: String, comment: String, at: Date, original: mongoose.Schema.Types.Mixed, proposed: mongoose.Schema.Types.Mixed, attachments: [mongoose.Schema.Types.Mixed] }],
}, { timestamps: true });

const industryPartnerSchema = new mongoose.Schema({
  // Embedded so a decision and its shared registry changes commit in one MongoDB write.
  changeRequests: { type: [partnerChangeSchema], select: false, default: [] },
  institutionDetails: { type: [{ _id: false, institution: String, contactPerson: String, contactPhone: String, contactEmail: String, liaisonOfficer: String, notes: String, version: Number }], select: false, default: [] },
  workflowVersion: { type: Number, default: 0 },
  name: { type: String, required: true, unique: true, trim: true },
  sector: { type: String, required: true },
  region: { type: String, required: true },
  district: { type: String },
  tradeArea: { type: String },
  town: { type: String },
  location: { type: String },
  coordinates: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
  partnerType: {
    type: String,
    enum: ['RegisteredCompany', 'MasterCraftPerson', 'Government', 'NGO', 'Other'],
    default: 'RegisteredCompany',
  },
  operatingModel: {
    type: String,
    enum: ['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises'],
    default: 'FixedSite',
  },
  locationVerificationStatus: {
    type: String,
    enum: ['PendingGPS', 'GPSVerified', 'NotApplicableMobile', 'ExceptionApproved'],
    default: 'PendingGPS',
  },
  locationVerificationNotes: { type: String, default: '', maxlength: 3000 },
  ghanaPostGps: { type: String, default: '', trim: true },
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
industryPartnerSchema.index({ locationVerificationStatus: 1, operatingModel: 1 });

export const IndustryPartner = mongoose.model('IndustryPartner', industryPartnerSchema);
