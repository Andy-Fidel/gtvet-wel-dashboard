import mongoose from 'mongoose';

const operationSchema = new mongoose.Schema({
  _id: String,
  plan: { type: mongoose.Schema.Types.Mixed, required: true },
  completed: { type: Boolean, default: false },
}, { timestamps: true });
const coordinatorSchema = new mongoose.Schema({
  _id: String,
  token: String,
  expiresAt: Date,
  sequence: { type: Number, default: 0 },
  pending: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
export const PlacementOperation = mongoose.model('PlacementOperation', operationSchema);
export const PlacementCoordinator = mongoose.model('PlacementCoordinator', coordinatorSchema);
