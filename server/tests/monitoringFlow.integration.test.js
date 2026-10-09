import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from '../routes/api.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';

const uri = process.env.GTVET_HEALTH_TEST_URI;
test('monitoring options and location checks require active authorized placements, then save attendance safely', { skip: !uri }, async () => {
  const target = new URL(uri); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.pathname, '/gtvet_system_health_test');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const db = mongoose.connection.db; await db.dropDatabase();
    const id = () => new mongoose.Types.ObjectId(), actor = { _id: id(), role: 'Staff', institution: 'QA', name: 'QA officer' };
    const own = id(), unplaced = id(), closed = id(), delegated = id(), hidden = id();
    await db.collection('learners').insertMany([{ _id: own, institution: 'QA', firstName: 'Own' }, { _id: unplaced, institution: 'QA', firstName: 'Unplaced', status: 'Placed' }, { _id: closed, institution: 'QA', firstName: 'Closed' }, { _id: delegated, institution: 'Other', firstName: 'Delegated' }, { _id: hidden, institution: 'Other', firstName: 'Hidden' }]);
    const actualPlacement = id(), townPlacement = id(), closedPlacement = id();
    await db.collection('placements').insertMany([
      { _id: actualPlacement, learner: own, institution: 'QA', status: 'Active', coordinates: { lat: 6.68, lng: -1.62 }, worksiteMode: 'FixedSite' },
      { _id: townPlacement, learner: delegated, institution: 'Other', delegate: actor._id, status: 'Active', coordinates: { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' }, worksiteMode: 'FixedSite' },
      { _id: closedPlacement, learner: closed, institution: 'QA', status: 'Completed', coordinates: { lat: 6.68, lng: -1.62 } },
      { _id: id(), learner: hidden, institution: 'Other', status: 'Active' },
    ]);
    const call = async (path, method, body = {}, query = {}, user = actor, params = {}) => {
      const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
      const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ user, body, query, params }, res); return res;
    };
    const options = await call('/learners/options', 'get', {}, { purpose: 'monitoring' });
    assert.equal(options.code, 200); assert.deepEqual(options.body.map(item => String(item._id)).sort(), [String(own), String(delegated)].sort());
    assert.equal(options.body.find(item => String(item._id) === String(delegated)).monitoringLocation.placementId.toString(), townPlacement.toString());
    const preview = body => call('/monitoring-visits/location-check', 'post', body);
    const inside = await preview({ learner: String(own), submittedLocation: { lat: 6.68, lng: -1.62, accuracy: 10, capturedAt: new Date().toISOString() } });
    assert.equal(inside.code, 200); assert.equal(inside.body.locationVerified, 'Verified'); assert.equal(inside.body.verificationRadiusMetres, 500);
    const outside = await preview({ learner: String(own), submittedLocation: { lat: 6.70, lng: -1.62, accuracy: 10, capturedAt: new Date().toISOString() } }); assert.equal(outside.body.locationVerified, 'Unverified');
    const town = await preview({ learner: String(delegated), submittedLocation: { lat: 6.70, lng: -1.62, accuracy: 10, capturedAt: new Date().toISOString() } }); assert.equal(town.body.locationVerified, 'Verified'); assert.equal(town.body.verificationRadiusMetres, 5000);
    const missingGPS = await preview({ learner: String(own) }); assert.equal(missingGPS.body.locationVerified, 'No GPS');
    assert.equal((await preview({ learner: String(hidden) })).code, 404);
    assert.equal((await call('/monitoring-visits/location-check', 'post', { learner: String(own) }, {}, { ...actor, role: 'HQStaff' })).code, 403);
    assert.equal((await preview({ learner: String(unplaced) })).code, 400);
    assert.equal((await preview({ learner: String(closed), placement: String(closedPlacement) })).code, 400);
    assert.equal(await MonitoringVisit.countDocuments(), 0);
    const base = { learner: String(own), visitDate: new Date(), visitType: 'Routine', performanceRating: 3, submittedLocation: { lat: 6.68, lng: -1.62, accuracy: 10, capturedAt: new Date().toISOString() } };
    for (const attendanceStatus of ['Present', 'Late', 'Absent', 'Excused']) {
      const saved = await call('/monitoring-visits', 'post', { ...base, attendanceStatus }); assert.equal(saved.code, 201, JSON.stringify(saved.body)); assert.equal(saved.body.attendanceStatus, attendanceStatus);
    }
    assert.equal((await call('/monitoring-visits', 'post', { ...base, learner: String(unplaced), gpsExceptionReason: 'Should not bypass an unplaced learner' })).code, 400);
    await db.collection('placements').updateOne({ _id: actualPlacement }, { $set: { status: 'Completed' } });
    assert.equal((await call('/monitoring-visits', 'post', { ...base, placement: String(actualPlacement), gpsExceptionReason: 'Placement just closed' })).code, 400);
    await MonitoringVisit.updateOne({ learner: own }, { $set: { gpsReviewComment: 'Original review evidence', gpsReviewedAt: new Date('2026-01-01') } });
    const historicalVisit = await MonitoringVisit.findOne({ learner: own }).lean();
    await db.collection('placements').updateOne({ _id: actualPlacement }, { $set: { coordinates: { lat: 8, lng: -1 } } });
    const updated = await call('/monitoring-visits/:id', 'put', { attendanceStatus: 'Excused' }, {}, { ...actor, role: 'Admin' }, { id: String(historicalVisit._id) });
    assert.equal(updated.code, 200, JSON.stringify(updated.body)); assert.equal(updated.body.attendanceStatus, 'Excused'); assert.equal(updated.body.locationVerified, 'Verified');
    assert.equal(updated.body.gpsReviewComment, historicalVisit.gpsReviewComment);
    assert.equal(updated.body.gpsReviewedAt.getTime(), historicalVisit.gpsReviewedAt.getTime());
    assert.deepEqual(updated.body.referenceCoordinates.toObject(), historicalVisit.referenceCoordinates);
    assert.equal(updated.body.gpsCapturedAt.getTime(), historicalVisit.gpsCapturedAt.getTime());
    const tampered = await call('/monitoring-visits/:id', 'put', { submittedLocation: { lat: 0, lng: 0 } }, {}, { ...actor, role: 'Admin' }, { id: String(historicalVisit._id) });
    assert.equal(tampered.code, 400);
    const oldCapture = new Date(Date.now() - 3600000).toISOString();
    await db.collection('placements').updateOne({ _id: actualPlacement }, { $set: { status: 'Active', coordinates: { lat: 6.68, lng: -1.62 } } });
    const offline = await call('/monitoring-visits', 'post', { ...base, submittedLocation: { ...base.submittedLocation, capturedAt: oldCapture } });
    assert.equal(offline.code, 201); assert.equal(offline.body.locationVerified, 'Stale GPS');
    assert.equal(offline.body.gpsCapturedAt.toISOString(), oldCapture);

  } finally { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
});
