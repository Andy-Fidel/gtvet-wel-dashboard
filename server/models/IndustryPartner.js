import mongoose from 'mongoose';

const industryPartnerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  sector: { type: String, required: true },
  region: { type: String, required: true },
  district: { type: String },
  location: { type: String },
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
  programs: [{ type: String }],
  mouDocumentUrl: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  linkedInstitutions: [{ type: String }],
}, { timestamps: true });

industryPartnerSchema.index({ region: 1 });
industryPartnerSchema.index({ sector: 1 });
industryPartnerSchema.index({ status: 1 });

export const IndustryPartner = mongoose.model('IndustryPartner', industryPartnerSchema);
