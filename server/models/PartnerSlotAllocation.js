import mongoose from 'mongoose';

const partnerSlotAllocationSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryPartner', required: true },
  institution: { type: String, required: true, trim: true },
  slots: { type: Number, required: true, min: 1, validate: Number.isInteger },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  academicYear: { type: String, default: '', trim: true },
  notes: { type: String, default: '', maxlength: 3000 },
  agreementReference: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Expired'], default: 'Pending' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewComment: { type: String, default: '', maxlength: 3000 },
  workflowVersion: Number,
}, { timestamps: true, autoIndex: false });

partnerSlotAllocationSchema.pre('validate', function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate('endDate', 'Allocation end date cannot be before its start date');
});
partnerSlotAllocationSchema.index({ partner: 1, status: 1, startDate: 1, endDate: 1 }, { name: 'partner_slot_active_window' });
partnerSlotAllocationSchema.index({ institution: 1, status: 1, endDate: 1 }, { name: 'institution_slot_status' });

export const PartnerSlotAllocation = mongoose.model('PartnerSlotAllocation', partnerSlotAllocationSchema);
