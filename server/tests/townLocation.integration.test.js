import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createWorkplaceSearchHandler } from '../utils/workplaceSearch.js';
import { TownLookupCache, TownLookupGate } from '../models/TownLookup.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { locationCheck } from '../utils/workplaceCoordinates.js';
import { normalizePartnerChanges } from '../utils/partnerChanges.js';
import router from '../routes/api.js';
const uri = process.env.GTVET_HEALTH_TEST_URI;
const res = () => ({ statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('shared Mongo gate serializes workers, caches searches and keeps town points separate on saved partners', { skip: !uri }, async () => {
  const target = new URL(uri); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.pathname, '/gtvet_system_health_test');
  // Avoid building unrelated modules' indexes during this isolated cold-database test.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000, autoIndex: false, autoCreate: false });
  try {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([TownLookupCache.createCollection(), TownLookupGate.createCollection()]);
    await TownLookupCache.createIndexes();
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return { ok: true, json: async () => [{ display_name: 'Kumasi, Ashanti, Ghana', lat: '6.68', lon: '-1.62', osm_type: 'node', osm_id: 123, addresstype: 'city', address: { country_code: 'gh' } }] };
    };
    const first = res(), second = res();
    await Promise.all([createWorkplaceSearchHandler({ env: {}, fetchImpl })({ query: { q: 'Kumasi' } }, first), createWorkplaceSearchHandler({ env: {}, fetchImpl })({ query: { q: 'Adenta' } }, second)]);
    assert.equal(calls, 1); assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 429]);
    const success = first.statusCode === 200 ? first : second;
    const cached = res();
    await createWorkplaceSearchHandler({ env: {}, fetchImpl })({ query: { q: first.statusCode === 200 ? 'KUMASI' : 'ADENTA' } }, cached);
    assert.equal(calls, 1); assert.deepEqual(cached.body, success.body);
    const blocked = res(); await createWorkplaceSearchHandler({ env: {}, fetchImpl })({ query: { q: 'Tamale' } }, blocked);
    assert.equal(blocked.statusCode, 429); assert.equal(calls, 1);
    assert.ok((await TownLookupGate.findById('nominatim')).nextAt > new Date());
    const indexes = await TownLookupCache.collection.indexes(); assert.ok(indexes.some(index => index.expireAfterSeconds === 0));
    const approximateLocation = success.body.results[0];
    const registered = res();
    const actor = { _id: new mongoose.Types.ObjectId(), role: 'SuperAdmin', name: 'QA actor' };
    const create = router.stack.find(layer => layer.route?.path === '/industry-partners' && layer.route.methods.post).route.stack.at(-1).handle;
    await create({ user: actor, body: { name: 'Town lookup QA partner', sector: 'Automotive', region: 'Ashanti', town: 'Kumasi', approximateLocation } }, registered);
    assert.equal(registered.statusCode, 201);
    const partner = registered.body;
    const saved = await IndustryPartner.findById(partner._id).lean();
    assert.equal(saved.approximateLocation.precision, 'Town'); assert.equal(saved.locationVerificationStatus, 'PendingGPS'); assert.equal(saved.coordinates?.lat, undefined);
    assert.equal(locationCheck({ lat: 6.68, lng: -1.62 }, saved.coordinates).locationVerified, 'Site coordinates missing');
    assert.deepEqual(normalizePartnerChanges({ approximateLocation }), { approximateLocation });
    await IndustryPartner.updateOne({ _id: partner._id }, { $set: { coordinates: { lat: 5.6, lng: -0.2 } } }, { runValidators: true });
    assert.equal((await IndustryPartner.findById(partner._id)).coordinates.lat, 5.6);
    const update = router.stack.find(layer => layer.route?.path === '/industry-partners/:id' && layer.route.methods.put).route.stack.at(-1).handle;
    const edited = res(); await update({ user: actor, params: { id: String(partner._id) }, body: { town: 'Adenta' } }, edited);
    assert.equal(edited.statusCode, 200); assert.equal(edited.body.approximateLocation, null); assert.equal(edited.body.coordinates.lat, 5.6);
    await TownLookupCache.updateMany({}, { $set: { expiresAt: new Date(0) } });
    await TownLookupGate.updateOne({ _id: 'nominatim' }, { $set: { nextAt: new Date(0) } });
    const expired = res(); await createWorkplaceSearchHandler({ env: {}, fetchImpl })({ query: { q: 'Kumasi' } }, expired); assert.equal(calls, 2);
  } finally { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
});
