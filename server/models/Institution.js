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
  programs: [{ type: String }],
}, { timestamps: true });

export const Institution = mongoose.model('Institution', institutionSchema);

