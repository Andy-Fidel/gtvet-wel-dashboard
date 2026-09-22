import mongoose from 'mongoose';

const placementRequestSchema = new mongoose.Schema({
  institution: { type: String, required: true },
  academicYear: { type: String, default: '' },
  workflowVersion: { type: Number, default: 0 },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner' },
  learners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Learner' }],
  program: { type: String, required: true },
  requestedSlots: { type: Number, required: true, min: 1, validate: Number.isInteger },
  placementRegion: { type: String, trim: true },
  coordinates: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
  worksiteMode: { type: String, enum: ['FixedSite', 'HomeBased', 'MobileField', 'MultipleSites', 'TemporarySite', 'NoFixedPremises'], default: 'FixedSite' },
  locationVerificationStatus: { type: String, enum: ['PendingGPS', 'GPSVerified', 'Provisional', 'NotApplicableMobile', 'ExceptionApproved'], default: 'PendingGPS' },
  locationVerificationNotes: { type: String, default: '', maxlength: 3000 },
  expectedOperatingArea: { type: String, default: '', maxlength: 1000 },
  sourceType: {
    type: String,
    enum: ['InstitutionFound', 'LearnerFound'],
    default: 'InstitutionFound',
  },
  selfSourcedHost: {
    companyName: { type: String, default: '' },
    sector: { type: String, default: '' },
    location: { type: String, default: '' },
    tradeArea: { type: String, default: '' },
    town: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  status: {
    type: String,
    enum: ['Submitted', 'Regional_Approved', 'HQ_Approved', 'Rejected', 'Placed', 'SelfSourced_Submitted', 'Under_Verification', 'Approved', 'Converted'],
    default: 'Submitted'
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedByRegional: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByHQ: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByInstitution: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regionalComment: String,
  hqComment: String,
  institutionComment: String,
  verificationNotes: String,
  verifiedAt: Date,
  convertedPlacementIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Placement' }],
  rejectionReason: String,
  startDate: Date,
  endDate: Date,
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archiveReason: { type: String, default: '' },
  archivedAcademicYear: { type: String, default: '' },
}, { timestamps: true });

placementRequestSchema.index({ institution: 1 });
placementRequestSchema.pre('validate', function () {
  if (!this.learners?.length || new Set(this.learners.map(String)).size !== this.learners.length) this.invalidate('learners', 'Select unique learners');
  if (this.requestedSlots !== this.learners?.length) this.invalidate('requestedSlots', 'Slots must equal the number of selected learners');
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate('endDate', 'Placement end date cannot be before start date');
});
placementRequestSchema.index({ status: 1 });
placementRequestSchema.index({ partner: 1 });
placementRequestSchema.index({ createdAt: -1 });
placementRequestSchema.index({ archivedAt: 1, institution: 1, createdAt: -1 });

export const PlacementRequest = mongoose.model('PlacementRequest', placementRequestSchema);
