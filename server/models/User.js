import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager', 'Staff', 'IndustryPartner', 'Guardian'], 
    default: 'Staff' 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  },
  phone: String,
  institution: { 
    type: String, 
    required: function() { 
      return this.role === 'Admin' || this.role === 'Manager' || this.role === 'Staff'; 
    } 
  },
  region: {
    type: String,
    required: function() { return this.role === 'RegionalAdmin'; }
  },
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndustryPartner',
    required: function() { return this.role === 'IndustryPartner'; }
  },
  linkedLearners: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Learner',
  }],
  profilePicture: { type: String, default: '' },
  notificationPreferences: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    whatsApp: { type: Boolean, default: false },
    systemUpdates: { type: Boolean, default: true },
    placementUpdates: { type: Boolean, default: true },
    supportUpdates: { type: Boolean, default: true },
    visitUpdates: { type: Boolean, default: true },
    assessmentUpdates: { type: Boolean, default: true },
    reportReminders: { type: Boolean, default: true },
    partnerUpdates: { type: Boolean, default: true },
  },
  invitationSentAt: { type: Date },
  inviteAcceptedAt: { type: Date },
  lastLoginAt: { type: Date },
  passwordChangeRequired: { type: Boolean, default: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = mongoose.model('User', userSchema);
