import 'dotenv/config';
import mongoose from 'mongoose';

// Default: read-only. --create-index changes only the index, never learner/partner data.
try {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the target database');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const db = mongoose.connection.db;
  const placements = db.collection('placements');
  const active = await placements.find({ status: 'Active' }).project({ learner: 1, partner: 1 }).toArray();
  const byLearner = new Map(), byPartner = new Map();
  for (const placement of active) {
    const learner = String(placement.learner);
    byLearner.set(learner, [...(byLearner.get(learner) || []), String(placement._id)]);
    if (placement.partner) byPartner.set(String(placement.partner), (byPartner.get(String(placement.partner)) || 0) + 1);
  }
  const duplicateActive = [...byLearner].filter(([, ids]) => ids.length > 1).map(([learnerId, placementIds]) => ({ learnerId, placementIds }));
  const capacityMismatch = [];
  for await (const partner of db.collection('industrypartners').find({}).project({ usedSlots: 1, totalSlots: 1 })) {
    const actual = byPartner.get(String(partner._id)) || 0;
    if (partner.usedSlots !== actual || actual > partner.totalSlots) capacityMismatch.push({ partnerId: partner._id, recorded: partner.usedSlots, actual, total: partner.totalSlots });
  }
  const learnerMismatch = [];
  for await (const learner of db.collection('learners').find({}).project({ placement: 1, status: 1 })) {
    const ids = byLearner.get(String(learner._id)) || [];
    if ((ids.length === 1 && (learner.status !== 'Placed' || String(learner.placement) !== ids[0])) || (!ids.length && (learner.status === 'Placed' || learner.placement))) learnerMismatch.push({ learnerId: learner._id, recordedPlacement: learner.placement, status: learner.status, activePlacementIds: ids });
  }
  const invalidDates = await placements.find({ $or: [{ startDate: null }, { endDate: null }, { $expr: { $lt: ['$endDate', '$startDate'] } }] }).project({ _id: 1 }).toArray();
  console.log(JSON.stringify({ activePlacements: active.length, duplicateActive, capacityMismatch, learnerMismatch, invalidDates, recordsChanged: 0 }, null, 2));
  if (process.argv.includes('--create-index')) {
    if (duplicateActive.length) throw new Error('Resolve duplicate active placements with explicit approval before installing the index. No records changed.');
    await placements.createIndex({ learner: 1 }, { name: 'one_active_placement_per_learner', unique: true, partialFilterExpression: { status: 'Active' } });
    console.log('Unique active-placement index installed. No operational records changed.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
