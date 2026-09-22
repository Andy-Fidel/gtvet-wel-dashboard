import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Placement } from '../models/Placement.js';
import { Learner } from '../models/Learner.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { PlacementTransfer } from '../models/PlacementTransfer.js';
import { PlacementCoordinator, PlacementOperation } from '../models/PlacementOperation.js';

export const placementError = (message, status = 409) => Object.assign(new Error(message), { status });
export const placementErrorStatus = error => error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : error.code === 11000 ? 409 : 500);
export const placementInputFields = ['companyName', 'sector', 'location', 'supervisorName', 'supervisorPhone', 'supervisorEmail', 'startDate', 'endDate', 'academicYear', 'placementRegion', 'coordinates', 'partner', 'worksiteMode', 'locationVerificationStatus', 'locationVerificationNotes', 'expectedOperatingArea', 'locationVerificationDueDate', 'locationExceptionApprovedBy', 'locationExceptionApprovedAt'];
export const placementInput = body => Object.fromEntries(placementInputFields.filter(key => Object.hasOwn(body || {}, key)).map(key => [key, body[key]]));

export function validatePlacementDates(start, end) {
  if (!start || !end || !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) throw placementError('Valid placement start and end dates are required.', 400);
  if (new Date(end) < new Date(start)) throw placementError('Placement end date cannot be before start date.', 400);
}

export function placementLearnerIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 200 || value.some(id => !mongoose.isValidObjectId(id))) throw placementError('Select between 1 and 200 valid learners.', 400);
  const ids = value.map(String);
  if (new Set(ids).size !== ids.length) throw placementError('Each learner may only appear once.', 400);
  return ids;
}

export function placementOperationKey(user, kind, data) {
  // A retry of the same command reuses its original operation, even after a lost response.
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return crypto.createHash('sha256').update(JSON.stringify([String(user._id), user.institution, kind, canonical(data)])).digest('hex');
}

const versionFilter = sequence => ({ $or: [{ workflowVersion: { $exists: false } }, { workflowVersion: { $lte: sequence } }] });
async function writeVersioned(model, id, update, sequence) {
  const result = await model.updateOne({ _id: id, ...versionFilter(sequence) }, { ...update, $set: { ...update.$set, workflowVersion: sequence } });
  if (!result.matchedCount) throw placementError('A placement dependency was changed or removed. Retry recovery or contact an administrator.');
}

export async function reconcilePlacementLinks(plan, renewLease = async () => {}, sequence = 0) {
  for (const learnerId of [...new Set(plan.learnerIds.map(String))]) {
    await renewLease();
    const active = await Placement.find({ learner: learnerId, status: 'Active' }).select('_id').lean();
    if (active.length > 1) throw placementError('Duplicate active placements require review. No automatic historical repair was performed.');
    if (active.length) await writeVersioned(Learner, learnerId, { $set: { status: 'Placed', placement: active[0]._id } }, sequence);
    else {
      const latest = await Placement.findOne({ learner: learnerId }).sort({ endDate: -1, createdAt: -1 }).select('status _id').lean();
      await writeVersioned(Learner, learnerId, { $set: { status: latest?.status === 'Completed' ? 'Completed' : 'Pending' }, $unset: { placement: 1 } }, sequence);
    }
  }
  for (const partnerId of [...new Set((plan.partnerIds || []).filter(Boolean).map(String))]) {
    await renewLease();
    const usedSlots = await Placement.countDocuments({ partner: partnerId, status: 'Active' });
    await writeVersioned(IndustryPartner, partnerId, { $set: { usedSlots } }, sequence);
  }
}

// Standalone MongoDB: persist the complete validated command before side effects.
// Every step is replayable; a failed operation blocks new commands until replay succeeds.
export async function runPlacementOperation(key, buildPlan) {
  try { await PlacementCoordinator.updateOne({ _id: 'global' }, { $setOnInsert: { pending: null } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const token = crypto.randomUUID();
  const lock = await PlacementCoordinator.findOneAndUpdate({ _id: 'global', $or: [{ token: { $exists: false } }, { expiresAt: { $lte: new Date() } }] },
    { $set: { token, expiresAt: new Date(Date.now() + 120000) }, $inc: { sequence: 1 } }, { returnDocument: 'after' }).lean();
  if (!lock) throw placementError('Another placement update is in progress. Retry shortly.');
  const assertLease = async () => {
    const result = await PlacementCoordinator.updateOne({ _id: 'global', token, expiresAt: { $gt: new Date() } }, { $set: { expiresAt: new Date(Date.now() + 120000) } });
    if (!result.matchedCount) throw placementError('Placement update lease expired. Retry to recover the operation.');
  };
  const replay = async operation => {
    if (!operation) throw placementError('Pending placement operation is missing; administrator review is required.');
    const plan = operation.plan;
    for (const item of plan.placements) {
      await assertLease();
      if (item.insert) await Placement.updateOne({ _id: item.id, ...versionFilter(lock.sequence) }, { $setOnInsert: { ...item.values, workflowVersion: lock.sequence } }, { upsert: true });
      else await writeVersioned(Placement, item.id, { $set: item.values }, lock.sequence);
    }
    await assertLease();
    await reconcilePlacementLinks(plan, assertLease, lock.sequence);
    await assertLease();
    if (plan.request) await writeVersioned(PlacementRequest, plan.request.id, { $set: plan.request.values }, lock.sequence);
    if (plan.transfer) {
      if (plan.transfer.insert) await PlacementTransfer.updateOne({ _id: plan.transfer.id }, { $setOnInsert: { ...plan.transfer.values, workflowVersion: lock.sequence } }, { upsert: true });
      else await writeVersioned(PlacementTransfer, plan.transfer.id, { $set: plan.transfer.values }, lock.sequence);
    }
    await assertLease();
    await PlacementOperation.updateOne({ _id: operation._id }, { $set: { completed: true, plan } }, { upsert: true, writeConcern: { w: 1, j: true } });
    await PlacementCoordinator.updateOne({ _id: 'global', token, 'pending._id': operation._id }, { $unset: { pending: 1 } });
    return plan;
  };
  try {
    if (lock.pending) await replay(lock.pending);
    let operation = await PlacementOperation.findById(key).lean();
    if (operation?.completed) return { ...operation.plan, replayed: true };
    if (!operation) {
      const plan = await buildPlan();
      await assertLease();
      operation = { _id: key, plan };
    }
    await assertLease();
    const prepared = await PlacementCoordinator.updateOne({ _id: 'global', token, expiresAt: { $gt: new Date() } }, { $set: { pending: operation } }, { writeConcern: { w: 1, j: true } });
    if (!prepared.matchedCount) throw placementError('Placement update lease expired before activation. Retry.');
    return await replay(operation);
  } finally {
    await PlacementCoordinator.updateOne({ _id: 'global', token }, { $unset: { token: 1, expiresAt: 1 } });
  }
}
