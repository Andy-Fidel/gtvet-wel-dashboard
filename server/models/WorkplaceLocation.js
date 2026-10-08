import mongoose from 'mongoose';

export const workplaceCoordinateSchema = new mongoose.Schema({
  lat: { type: Number, min: -90, max: 90 },
  lng: { type: Number, min: -180, max: 180 },
  precision: { type: String, enum: ['Actual', 'Town'] },
  townName: { type: String, maxlength: 500, required() { return this.precision === 'Town'; } },
}, { _id: false });
