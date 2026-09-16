import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  region: { type: String, required: true },
  district: { type: String, required: true },
  location: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['A', 'B', 'C'], 
    default: 'B'
  },
  status: { 
    type: String, 
    required: true 
  },
  gender: { 
    type: String, 
    enum: ['Boys', 'Girls', 'Mixed'], 
    required: true 
  },
  calendarType: {
    type: String,
    enum: ['Single Track', 'Transitional'],
    default: 'Single Track',
  },
  programs: [{ type: String }],
  idmsInstitutionId: { type: String, trim: true, default: '' },
  idmsInstitutionName: { type: String, trim: true, default: '' },
  idmsSyncEnabled: { type: Boolean, default: false },
  lastIdmsSyncAt: { type: Date },
  lastIdmsSyncAcademicYear: { type: String, default: '' },
}, { timestamps: true });

institutionSchema.index(
  { idmsInstitutionId: 1 },
  {
    unique: true,
    partialFilterExpression: { idmsInstitutionId: { $type: 'string', $gt: '' } },
    name: 'unique_idms_institution_id',
  }
);

export const Institution = mongoose.model('Institution', institutionSchema);
