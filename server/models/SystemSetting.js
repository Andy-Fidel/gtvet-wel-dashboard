import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  organizationName: { type: String, default: 'GTVETS WEL Dashboard' },
  supportEmail: { type: String, default: '' },
  supportPhone: { type: String, default: '' },
  defaultPlacementDurationWeeks: { type: Number, default: 12, min: 1, max: 52 },
  attendanceCadenceDays: { type: Number, default: 7, min: 1, max: 60 },
  monitoringVisitCadenceDays: { type: Number, default: 30, min: 1, max: 120 },
  midpointAssessmentOffsetDays: { type: Number, default: 45, min: 1, max: 365 },
  finalAssessmentOffsetDays: { type: Number, default: 0, min: -30, max: 30 },
  employerEvaluationOffsetDays: { type: Number, default: 0, min: -30, max: 30 },
  maintenanceMode: { type: Boolean, default: false },
  allowPlacementMessaging: { type: Boolean, default: true },
  enablePartnerSelfService: { type: Boolean, default: true },
  defaultAcademicYear: { type: String, default: '' },
  timezone: { type: String, default: 'Africa/Accra' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
