import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';

dotenv.config();

const {
  MONGODB_URI,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  SUPERADMIN_NAME = 'Super Admin',
  RESET_SUPERADMIN_PASSWORD,
  SUPERADMIN_PASSWORD_CHANGE_REQUIRED,
} = process.env;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!MONGODB_URI) {
  fail('MONGODB_URI is required.');
}

if (!SUPERADMIN_EMAIL) {
  fail('SUPERADMIN_EMAIL is required.');
}

if (!SUPERADMIN_PASSWORD || SUPERADMIN_PASSWORD.length < 12) {
  fail('SUPERADMIN_PASSWORD is required and must be at least 12 characters.');
}

const passwordChangeRequired = SUPERADMIN_PASSWORD_CHANGE_REQUIRED
  ? SUPERADMIN_PASSWORD_CHANGE_REQUIRED === 'true'
  : true;

try {
  await mongoose.connect(MONGODB_URI);

  const existingUser = await User.findOne({ email: SUPERADMIN_EMAIL });
  if (existingUser) {
    existingUser.role = 'SuperAdmin';
    existingUser.status = 'Active';
    existingUser.name = existingUser.name || SUPERADMIN_NAME;

    if (RESET_SUPERADMIN_PASSWORD === 'true') {
      existingUser.password = SUPERADMIN_PASSWORD;
      existingUser.passwordChangeRequired = passwordChangeRequired;
      await existingUser.save();
      console.log(`Reset SuperAdmin account: ${SUPERADMIN_EMAIL}`);
    } else {
      await existingUser.save();
      console.log(`SuperAdmin account already exists: ${SUPERADMIN_EMAIL}`);
      console.log('Set RESET_SUPERADMIN_PASSWORD=true to reset its password.');
    }
  } else {
    await User.create({
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      role: 'SuperAdmin',
      status: 'Active',
      passwordChangeRequired,
    });
    console.log(`Created SuperAdmin account: ${SUPERADMIN_EMAIL}`);
  }
} catch (error) {
  console.error('Failed to bootstrap SuperAdmin account:', error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
