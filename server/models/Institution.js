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
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Day', 'Boarding'], 
    required: true 
  },
  gender: { 
    type: String, 
    enum: ['Boys', 'Girls', 'Mixed'], 
    required: true 
  }
}, { timestamps: true });

export const Institution = mongoose.model('Institution', institutionSchema);
