import 'dotenv/config';
import mongoose from 'mongoose';

try {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the target database');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const allocations = mongoose.connection.collection('partnerslotallocations');
  await allocations.createIndex(
    { partner: 1, status: 1, startDate: 1, endDate: 1 },
    { name: 'partner_slot_active_window' },
  );
  await allocations.createIndex(
    { institution: 1, status: 1, endDate: 1 },
    { name: 'institution_slot_status' },
  );
  console.log('Partner slot allocation indexes installed. No operational records changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
