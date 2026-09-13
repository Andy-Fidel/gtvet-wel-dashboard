import 'dotenv/config';
import mongoose from 'mongoose';

// Run with partner writes paused. Default is read-only; --apply enables migration.
try {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the target database');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const partners = mongoose.connection.collection('industrypartners');
  const conflicts = await partners.aggregate([
    { $project: { name: { $trim: { input: '$name' } } } },
    { $group: { _id: '$name', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ], { collation: { locale: 'en', strength: 2 } }).toArray();
  if (conflicts.length) {
    console.error('Conflicting partner names; no records changed:', JSON.stringify(conflicts, null, 2));
    process.exitCode = 1;
  } else if (!process.argv.includes('--apply')) {
    console.log('No name conflicts. Pause partner writes, then rerun with --apply to trim names and create the unique index.');
  } else {
    await partners.updateMany({}, [{ $set: { name: { $trim: { input: '$name' } } } }]);
    await partners.createIndex({ name: 1 }, { name: 'partner_name_ci_unique', unique: true, collation: { locale: 'en', strength: 2 } });
    console.log('Partner names trimmed and case-insensitive unique index verified. No partners deleted or merged.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
