import mongoose from 'mongoose';

// A single coordinator protects lifecycle checks on standalone MongoDB.
const schema = new mongoose.Schema({ _id: String, token: String, expiresAt: Date });
export const UserManagementLock = mongoose.model('UserManagementLock', schema);
