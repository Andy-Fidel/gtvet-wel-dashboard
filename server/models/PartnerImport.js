import mongoose from 'mongoose';

const rowSchema = new mongoose.Schema({
  row: Number,
  name: String,
  data: mongoose.Schema.Types.Mixed,
  partnerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['Ready', 'Created', 'Skipped'], required: true },
  message: String,
}, { _id: false });

const schema = new mongoose.Schema({
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rows: [rowSchema],
}, { timestamps: true });
schema.index({ addedBy: 1, createdAt: -1 });
export const PartnerImport = mongoose.model('PartnerImport', schema);
