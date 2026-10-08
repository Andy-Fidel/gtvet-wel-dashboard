import mongoose from 'mongoose';

export const approximateLocationSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 500 },
  lat: { type: Number, required: true, min: 4, max: 12 },
  lng: { type: Number, required: true, min: -4, max: 2 },
  source: { type: String, enum: ['OpenStreetMap'], required: true },
  precision: { type: String, enum: ['Town'], required: true },
  osmType: { type: String, enum: ['node', 'way', 'relation'], required: true },
  osmId: { type: String, required: true, match: /^\d{1,20}$/ },
}, { _id: false });

const cacheSchema = new mongoose.Schema({
  _id: String, results: [approximateLocationSchema], expiresAt: { type: Date, required: true },
});
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const TownLookupCache = mongoose.model('TownLookupCache', cacheSchema);
export const TownLookupGate = mongoose.model('TownLookupGate', new mongoose.Schema({ _id: String, token: String, nextAt: Date }));
