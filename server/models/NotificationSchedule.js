import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  nextRunAt: { type: Date, required: true },
});

export const NotificationSchedule = mongoose.model('NotificationSchedule', schema);
