import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCoordinates, locationCheck, monitoringLocationCheck, registeredCoordinates, coordinateStatus } from '../utils/workplaceCoordinates.js';
import { Placement } from '../models/Placement.js';
import { PlacementRequest } from '../models/PlacementRequest.js';
import { IndustryPartner } from '../models/IndustryPartner.js';

const town = { lat: 6.68, lng: -1.62, precision: 'Town', townName: 'Kumasi' };

test('actual and town points retain precision through normalization and schema persistence', async () => {
  assert.deepEqual(normalizeCoordinates(town), town);
  assert.deepEqual(normalizeCoordinates({ lat: 0, lng: 0 }), { lat: 0, lng: 0 });
  for (const Model of [Placement, PlacementRequest, IndustryPartner]) {
    const doc = new Model({ coordinates: town });
    assert.deepEqual(doc.toObject().coordinates, town);
    assert.equal((await doc.validate().catch(error => error))?.errors?.['coordinates.precision'], undefined);
  }
  assert.equal(coordinateStatus(town), 'TownSelected');
  assert.equal(coordinateStatus({ lat: 5, lng: 0 }), 'GPSVerified');
});
test('town proximity uses 5 km while actual and legacy points use 500 metres', () => {
  const visitor = { lat: 6.70, lng: -1.62 };
  assert.equal(locationCheck(visitor, town).gpsReviewStatus, 'Verified');
  assert.equal(locationCheck(visitor, { lat: town.lat, lng: town.lng }).gpsReviewStatus, 'PendingReview');
  assert.equal(locationCheck({ lat: 6.76, lng: -1.62 }, town).gpsReviewStatus, 'PendingReview');
});
test('invalid town precision is rejected and clients cannot supply a larger verification radius', () => {
  for (const point of [{ ...town, townName: '' }, { ...town, precision: 'Unknown' }, { ...town, lat: 25 }]) assert.throws(() => normalizeCoordinates(point));
  const point = normalizeCoordinates({ ...town, radiusMetres: 1000000 });
  const result = monitoringLocationCheck({ lat: 6.76, lng: -1.62 }, { coordinates: point });
  assert.equal(result.verificationRadiusMetres, 5000);
  assert.equal(result.gpsReviewStatus, 'PendingReview');
  assert.deepEqual(result.referenceCoordinates, town);
});
test('mobile workplaces with a selected point use the same check; unlocated operating areas keep existing evidence behavior', () => {
  const outside = { lat: 6.76, lng: -1.62 };
  assert.equal(monitoringLocationCheck(outside, { coordinates: town, worksiteMode: 'MobileField' }).gpsReviewStatus, 'PendingReview');
  assert.equal(monitoringLocationCheck(outside, { worksiteMode: 'MobileField' }).verificationLocationType, 'OperatingArea');
  assert.equal(monitoringLocationCheck(null, { coordinates: town }).gpsReviewStatus, 'PendingReview');
});
test('legacy town selections can be resolved without replacing explicit workplace snapshots', () => {
  const approximateLocation = { ...town, name: 'Kumasi' };
  assert.deepEqual(registeredCoordinates({ approximateLocation }), town);
  const actual = { lat: 5.6, lng: -0.2 };
  assert.deepEqual(registeredCoordinates({ approximateLocation, coordinates: actual }), actual);
});

test('automatic monitoring verification requires an accurate fresh capture', () => {
  const point = { lat: town.lat, lng: town.lng, accuracy: 10, capturedAt: new Date().toISOString() };
  const placement = { coordinates: town };
  assert.equal(monitoringLocationCheck(point, placement).locationVerified, 'Verified');
  for (const accuracy of [50000, undefined, -1]) {
    assert.equal(monitoringLocationCheck({ ...point, accuracy }, placement).locationVerified, 'Low accuracy');
  }
  for (const capturedAt of [undefined, 'invalid', new Date(Date.now() - 3600000), new Date(Date.now() + 3600000)]) {
    assert.equal(monitoringLocationCheck({ ...point, capturedAt }, placement).locationVerified, 'Stale GPS');
  }
  const mobile = monitoringLocationCheck(point, { worksiteMode: 'MobileField' });
  assert.equal(mobile.locationVerified, 'GPS captured'); assert.equal(mobile.gpsReviewStatus, 'PendingReview');
});
