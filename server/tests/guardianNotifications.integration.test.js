import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { User } from '../models/User.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Notification } from '../models/Notification.js';
import { notifyGuardianUpdates } from '../utils/guardianNotifications.js';

test('saved milestones notify only linked active guardians, respect preferences and deduplicate retries', { skip: process.env.GUARDIAN_MONGO_INTEGRATION !== '1' }, async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27030/guardian_notifications_qa_${Date.now()}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  try {
    await Placement.collection.createIndex({ learner: 1 }, { name: 'one_active_placement_per_learner', unique: true, partialFilterExpression: { status: 'Active' } });
    await Notification.collection.createIndex({ dedupeIdentity: 1 }, { unique: true, sparse: true });
    const id = () => new mongoose.Types.ObjectId();
    const wards = [id(), id(), id()], partner = id(), guardian = id(), secondGuardian = id(), inactive = id(), unrelated = id(), optedOut = id();
    const admin = { _id: id(), role: 'Admin', institution: 'QA', name: 'QA Admin' };
    const now = new Date(), year = now.getFullYear() - (now.getMonth() < 7 ? 1 : 0);
    const academicYear = `${year}/${year + 1}`;
    const startDate = now.toISOString().slice(0, 10), endDate = new Date(now.getTime() + 86400000 * 30).toISOString().slice(0, 10);
    await Learner.collection.insertMany(wards.map((_id, index) => ({ _id, firstName: `Ward${index}`, lastName: 'Mensah', trackingId: `QA-${index}`, institution: 'QA', phone: '0000000000', program: 'IT', year: 'Year 1', academicStatus: 'Active', status: 'Pending' })));
    await mongoose.connection.db.collection('institutions').insertOne({ name: 'QA', region: 'Greater Accra', calendarType: 'Single Track' });
    await mongoose.connection.db.collection('academiccalendars').insertOne({ eventType: 'WEL Window', isActive: true, academicYear, institutionCalendarType: 'Single Track', targetYearGroup: 'Year 1', semester: 'Semester 1', startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000 * 60) });
    await IndustryPartner.collection.insertOne({ _id: partner, name: 'QA Workplace', sector: 'IT', region: 'Greater Accra', status: 'Active', approvalStatus: 'Approved', totalSlots: 10, usedSlots: 0 });
    await User.collection.insertMany([
      { _id: guardian, role: 'Guardian', status: 'Active', institution: 'Different', linkedLearners: wards.slice(0, 2) },
      { _id: secondGuardian, role: 'Guardian', status: 'Active', linkedLearners: [wards[0]] },
      { _id: inactive, role: 'Guardian', status: 'Inactive', linkedLearners: [wards[0]] },
      { _id: unrelated, role: 'Guardian', status: 'Active', linkedLearners: [wards[2]] },
      { _id: optedOut, role: 'Guardian', status: 'Active', linkedLearners: wards.slice(0, 2), notificationPreferences: { placementUpdates: false, visitUpdates: false, assessmentUpdates: false } },
    ]);
    const call = async (path, method, body, user = admin, params = {}) => {
      const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ body, params, user, query: {} }, res);
      return res;
    };
    const input = { learners: wards.slice(0, 2).map(String), partner: String(partner), coordinates: { lat: 0, lng: 0 }, startDate, endDate, academicYear, placementRegion: 'Greater Accra' };
    assert.equal((await call('/placements', 'post', input, { ...admin, role: 'Staff' })).code, 403);
    assert.equal(await Notification.countDocuments(), 0);
    const placed = await call('/placements', 'post', input);
    assert.equal(placed.code, 201, JSON.stringify(placed.body));
    assert.equal(await Notification.countDocuments({ recipient: guardian, type: 'placement' }), 2);
    assert.equal(await Notification.countDocuments({ recipient: secondGuardian, type: 'placement' }), 1);
    assert.equal((await call('/placements', 'post', input)).code, 200);
    assert.equal(await Notification.countDocuments({ type: 'placement' }), 3, 'Activation replay does not repeat alerts');
    const firstPlacement = placed.body.find(record => String(record.learner) === String(wards[0]));
    const delegate = { _id: id(), role: 'Staff', institution: 'Other', name: 'Delegate' };
    await Placement.updateOne({ _id: firstPlacement._id }, { $set: { delegate: delegate._id } });
    const visit = await call('/monitoring-visits', 'post', { learner: String(wards[0]), placement: String(firstPlacement._id), visitDate: startDate, gpsExceptionReason: 'GPS unavailable during visit' }, delegate);
    assert.equal(visit.code, 201, JSON.stringify(visit.body));
    assert.equal(visit.body.institution, 'QA');
    assert.equal(await Notification.countDocuments({ type: 'visit' }), 2, 'Delegated visits notify the ward’s guardians');
    await notifyGuardianUpdates({ type: 'visit', records: [visit.body] });
    assert.equal(await Notification.countDocuments({ type: 'visit' }), 2);
    const assessed = await call('/assessments', 'post', { learner: String(wards[0]), assessmentDate: startDate, assessmentType: 'Practical', technicalSkills: 'Technical skills', softSkills: 'Communication', professionalism: 3, problemSolving: 3, overallScore: 0, assessorName: 'QA Assessor', institution: 'Forged' }, { _id: id(), role: 'IndustryPartner', partnerId: partner });
    assert.equal(assessed.code, 201, JSON.stringify(assessed.body));
    assert.equal(await Notification.countDocuments({ type: 'assessment' }), 2);
    await notifyGuardianUpdates({ type: 'assessment', records: [{ ...assessed.body, learner: wards[0] }] });
    assert.equal(await Notification.countDocuments({ type: 'assessment' }), 2);
    await notifyGuardianUpdates({ type: 'visit', records: [{ _id: id(), learner: wards[0], institution: 'Forged' }] });
    assert.equal(await Notification.countDocuments({ type: 'visit' }), 2, 'Mismatched institution produces no alert');
    assert.equal(await Notification.countDocuments({ recipient: { $in: [inactive, unrelated, optedOut] } }), 0);
    const notifications = await Notification.find().lean();
    for (const note of notifications) {
      assert.equal(note.link, '/guardian-dashboard');
      assert.equal(note.visibleInApp, true);
      assert.match(note.message, /Mensah Ward[01]/);
      assert.ok(note.dedupeIdentity);
      assert.doesNotMatch(note.message, /Forged|technical skills|GPS unavailable/i);
    }
    await User.updateOne({ _id: guardian }, { $set: { linkedLearners: [wards[1]] } });
    await notifyGuardianUpdates({ type: 'visit', records: [{ _id: id(), learner: wards[0], institution: 'QA', visitDate: startDate }] });
    assert.equal(await Notification.countDocuments({ recipient: guardian, type: 'visit' }), 1, 'Removed guardian links receive no later updates');
    const beforeInvalid = await Notification.countDocuments();
    const invalidVisit = await call('/monitoring-visits', 'post', { learner: String(wards[0]), visitDate: startDate }, admin);
    assert.equal(invalidVisit.code, 400);
    const invalidAssessment = await call('/assessments', 'post', { learner: String(wards[0]), overallScore: 101 }, { _id: id(), role: 'IndustryPartner', partnerId: partner });
    assert.equal(invalidAssessment.code, 400);
    assert.equal(await Notification.countDocuments(), beforeInvalid, 'Rejected submissions do not produce milestone alerts');
    const requested = await call('/placement-requests', 'post', { ...input, learners: [String(wards[2])], requestedSlots: 1, program: 'IT' }, { ...admin, role: 'Staff' });
    assert.equal(requested.code, 201, JSON.stringify(requested.body));
    assert.equal(await Notification.countDocuments({ recipient: unrelated }), 0, 'A request is not an activated placement');
    const converted = await call('/placement-requests/:id/convert', 'post', { coordinates: input.coordinates }, admin, { id: String(requested.body._id) });
    assert.equal(converted.code, 200, JSON.stringify(converted.body));
    assert.equal(await Notification.countDocuments({ recipient: unrelated, type: 'placement' }), 1);
    await call('/placement-requests/:id/convert', 'post', { coordinates: input.coordinates }, admin, { id: String(requested.body._id) });
    assert.equal(await Notification.countDocuments({ recipient: unrelated, type: 'placement' }), 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
