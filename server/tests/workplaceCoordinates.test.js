import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCoordinates, normalizeCoordinates, locationCheck } from '../utils/workplaceCoordinates.js';
import { parsePartnerCsv } from '../utils/partnerImport.js';
import { Placement } from '../models/Placement.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { MonitoringVisit } from '../models/MonitoringVisit.js';
import { AuditLog } from '../models/AuditLog.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import router, { recheckPendingPlacementVisits } from '../routes/api.js';

async function call(path, method, body, user = { role: 'Admin', institution: 'Institute', _id: 'actor' }) {
  const req = { body, user, params: { id: 'placement' }, method: method.toUpperCase() };
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  await route.stack.at(-1).handle(req, res);
  return res;
}

test('coordinates accept zero and boundary values, reject incomplete and invalid input', () => {
  assert.deepEqual(normalizeCoordinates({ lat: '0', lng: '0' }, true), { lat: 0, lng: 0 });
  assert.equal(hasCoordinates({ lat: -90, lng: 180 }), true);
  assert.equal(normalizeCoordinates({}), undefined);
  for (const value of [undefined, {}, { lat: 1 }, { lat: ' ', lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: NaN, lng: 1 }, { lat: true, lng: 1 }]) {
    assert.throws(() => normalizeCoordinates(value, true));
  }
});

test('distance check accepts zero longitude and distinguishes missing site from missing GPS', () => {
  assert.equal(locationCheck({ lat: 5, lng: 0 }, { lat: 5, lng: 0 }).gpsReviewStatus, 'Verified');
  assert.equal(locationCheck({ lat: 0.004, lng: 0 }, { lat: 0, lng: 0 }).locationVerified, 'Verified');
  assert.equal(locationCheck({ lat: 0.005, lng: 0 }, { lat: 0, lng: 0 }).locationVerified, 'Unverified');
  assert.equal(locationCheck({ lat: 5, lng: 0 }, {}).locationVerified, 'Site coordinates missing');
  assert.equal(locationCheck(null, { lat: 5, lng: 0 }).locationVerified, 'No GPS');
});

test('partner CSV supports optional coordinates and rejects half-pairs', () => {
  const [valid, invalid] = parsePartnerCsv('name,sector,region,latitude,longitude\nValid,IT,Volta,5,0\nInvalid,IT,Volta,5,');
  assert.deepEqual(valid.data.coordinates, { lat: 5, lng: 0 });
  assert.ok(invalid.errors.length);
});

test('active model creation requires coordinates while closed records can omit them', async () => {
  const data = { learner: '507f1f77bcf86cd799439011', companyName: 'Company', sector: 'IT', location: 'Accra', institution: 'Institute' };
  await assert.rejects(new Placement(data).validate(), /latitude and longitude/);
  await new Placement({ ...data, coordinates: { lat: 0, lng: 0 } }).validate();
  await new Placement({ ...data, status: 'Completed' }).validate();
});

test('direct activation and request conversion reject missing coordinates before creating records', async t => {
  assert.equal((await call('/placements', 'post', {})).statusCode, 400);
  t.mock.method(PlacementRequest, 'findOne', () => ({ populate() { return this; }, lean: async () => ({ sourceType: 'LearnerFound', status: 'Approved', learners: [], institution: 'Institute' }) }));
  const result = await call('/placement-requests/:id/convert', 'post', {});
  assert.equal(result.statusCode, 400);
  assert.match(result.body.message, /coordinates|latitude/);
});

test('placement edit scopes by institution and rejects reactivation without GPS', async t => {
  let filter;
  t.mock.method(Placement, 'findOne', async value => { filter = value; return { status: 'Completed' }; });
  const result = await call('/placements/:id', 'put', { status: 'Active' });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(filter, { _id: 'placement', institution: 'Institute' });
});

test('pending rechecks use captured location, guard completed decisions and audit changes', async t => {
  let filter;
  const changes = [], audits = [];
  t.mock.method(MonitoringVisit, 'find', async value => {
    filter = value;
    return [{ _id: 'visit', submittedLocation: { lat: 5, lng: 0 }, gpsReviewStatus: 'PendingReview', locationVerified: 'No Placement' }];
  });
  t.mock.method(MonitoringVisit, 'findOneAndUpdate', async (query, update) => { changes.push({ query, update }); return {}; });
  t.mock.method(AuditLog, 'create', async value => { audits.push(value); });
  await recheckPendingPlacementVisits({ _id: 'site', learner: 'learner', institution: 'Institute', status: 'Active', coordinates: { lat: 5, lng: 0 } }, { user: { role: 'Admin', name: 'Admin' } });
  assert.equal(filter.gpsReviewStatus, 'PendingReview');
  assert.deepEqual(filter.$or, [{ placement: 'site' }]);
  assert.equal(changes[0].query.gpsReviewStatus, 'PendingReview');
  assert.equal(changes[0].update.$set.gpsReviewStatus, 'Verified');
  assert.equal(changes[0].update.$set.submittedLocation, undefined);
  assert.equal(changes[0].update.$set.gpsCapturedAt, undefined);
  assert.equal(audits.length, 1);
});

test('partner edits persist coordinates including zero longitude', async t => {
  let updated;
  t.mock.method(IndustryPartner, 'findById', async () => ({ _id: 'partner' }));
  t.mock.method(IndustryPartner, 'findByIdAndUpdate', async (id, value) => { updated = value; return { _id: id, ...value }; });
  t.mock.method(AuditLog, 'create', async () => ({}));
  const result = await call('/industry-partners/:id', 'put', { coordinates: { lat: 5, lng: 0 } }, { role: 'SuperAdmin' });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(updated.coordinates, { lat: 5, lng: 0 });
});
