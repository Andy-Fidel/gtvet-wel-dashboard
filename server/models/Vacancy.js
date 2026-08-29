import mongoose from 'mongoose';

const vacancySchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner', required: true, index: true },
  title: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  tradeArea: { type: String, default: '', trim: true },
  description: { type: String, required: true, trim: true },
  requirements: { type: String, default: '', trim: true },
  region: { type: String, required: true, index: true },
  district: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  slots: { type: Number, required: true, min: 1 },
  filledSlots: { type: Number, default: 0, min: 0 },
  applicationDeadline: { type: Date },
  placementStartDate: { type: Date },
  placementEndDate: { type: Date },
  contactEmail: { type: String, default: '', trim: true },
  contactPhone: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Closed'],
    default: 'Draft',
    index: true,
  },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedAt: { type: Date },
  closedAt: { type: Date },
}, { timestamps: true });

vacancySchema.index({ region: 1, status: 1, applicationDeadline: 1 });
vacancySchema.index({ partner: 1, status: 1, createdAt: -1 });

export const Vacancy = mongoose.model('Vacancy', vacancySchema);
