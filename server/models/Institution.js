import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  // Other collections reference the institution by name, so changing it would sever their history.
  name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 200, immutable: true },
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, minlength: 2, maxlength: 50 },
  nameKey: { type: String, select: false },
  codeKey: { type: String, select: false },
  region: {
    type: String, required: true, trim: true,
    enum: ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'],
  },
  district: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['A', 'B', 'C'], 
    default: 'B'
  },
  status: { 
    type: String, 
    required: true,
    enum: ['Day', 'Boarding', 'Day/Boarding'],
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
  idmsSyncEnabled: {
    type: Boolean,
    default: false,
    validate: {
      validator(value) { return !value || Boolean(this.idmsInstitutionId?.trim()); },
      message: 'IDMS institution ID is required when IDMS sync is enabled',
    },
  },
  lastIdmsSyncAt: { type: Date },
  lastIdmsSyncAcademicYear: { type: String, default: '' },
}, { timestamps: true });

institutionSchema.pre('validate', function () {
  this.nameKey = this.name?.trim().toLocaleLowerCase('en');
  this.codeKey = this.code?.trim().toLocaleUpperCase('en');
});

institutionSchema.index({ nameKey: 1 }, { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } });
institutionSchema.index({ codeKey: 1 }, { unique: true, partialFilterExpression: { codeKey: { $type: 'string' } } });

institutionSchema.index(
  { idmsInstitutionId: 1 },
  {
    unique: true,
    partialFilterExpression: { idmsInstitutionId: { $type: 'string', $gt: '' } },
    name: 'unique_idms_institution_id',
  }
);

export const Institution = mongoose.model('Institution', institutionSchema);
