import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkplaceSearchHandler, parseTownResults } from '../utils/workplaceSearch.js';
import { normalizeApproximateLocation } from '../utils/townLocation.js';
import { locationCheck, worksiteRequiresCoordinates } from '../utils/workplaceCoordinates.js';
import router from '../routes/api.js';
const town = { name: 'Kumasi, Ashanti, Ghana', lat: 6.68, lng: -1.62, source: 'OpenStreetMap', precision: 'Town', osmType: 'node', osmId: '123' };
const upstream = [{ display_name: town.name, lat: '6.68', lon: '-1.62', osm_type: 'node', osm_id: 123, addresstype: 'city', address: { country_code: 'gh' } }];
export function response() { return { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
const store = () => ({ read: async () => null, write: async () => {}, acquire: async () => 'token', release: async () => {} });
test('town lookup is behind authentication and role checks', async () => {
  const layer = router.stack.find(l => l.route?.path === '/workplace-location-search');
  assert.ok(router.stack.findIndex(l => l.name === 'auth') < router.stack.indexOf(layer));
  for (const role of [undefined, 'Guardian', 'Admin', 'SuperAdmin', 'IndustryPartner']) {
    let allowed = false; const res = response();
    await layer.route.stack[0].handle({ user: role ? { role } : undefined }, res, () => { allowed = true; });
    assert.equal(allowed, Boolean(role && role !== 'Guardian'));
  }
});
test('rejects private-address-like queries and supports operational disable without I/O', async () => {
  const handler = createWorkplaceSearchHandler({ store: store(), env: { TOWN_LOOKUP_ENABLED: 'false' }, fetchImpl: () => assert.fail('no upstream') });
  for (const q of ['', 'ab', ['Kumasi'], 'x'.repeat(161), 'person@example.com', 'GA-123-4567', '123 Home Road']) {
    const res = response(); await handler({ query: { q } }, res); assert.equal(res.statusCode, 400);
  }
  const res = response(); await handler({ query: { q: 'Kumasi' } }, res); assert.equal(res.statusCode, 503);
});
test('country-filtered identified request returns settlement points and caches results', async () => {
  let saved, released;
  const handler = createWorkplaceSearchHandler({ env: {}, store: { ...store(), write: async (key, results) => { saved = { key, results }; }, release: async token => { released = token; } }, fetchImpl: async (url, options) => {
    assert.equal(url.origin, 'https://nominatim.openstreetmap.org'); assert.equal(url.searchParams.get('countrycodes'), 'gh');
    assert.equal(url.searchParams.get('q'), 'Kumasi'); assert.match(options.headers['User-Agent'], /GTVET-WEL/);
    assert.ok(options.signal); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => [...upstream, { ...upstream[0], address: { country_code: 'us' } }, { ...upstream[0], addresstype: 'house' }] };
  } });
  const res = response(); await handler({ query: { q: ' Kumasi ' } }, res);
  assert.deepEqual(res.body.results, [town]); assert.deepEqual(saved.results, [town]); assert.equal(released, 'token'); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('cache hit bypasses upstream; busy gate and failed requests are bounded and safe', async () => {
  const res = response(); await createWorkplaceSearchHandler({ env: {}, store: { ...store(), read: async () => [town], acquire: () => assert.fail('cached') }, fetchImpl: () => assert.fail('cached') })({ query: { q: 'Kumasi' } }, res);
  assert.deepEqual(res.body.results, [town]);
  const busy = response(); await createWorkplaceSearchHandler({ env: {}, store: { ...store(), acquire: async () => null }, fetchImpl: () => assert.fail('busy') })({ query: { q: 'Adenta' } }, busy);
  assert.equal(busy.statusCode, 429); assert.equal(busy.headers['Retry-After'], '2');
  let released = false;
  const failure = response(); await createWorkplaceSearchHandler({ env: {}, store: { ...store(), release: async () => { released = true; } }, fetchImpl: async () => { throw new Error('private credential'); } })({ query: { q: 'Adenta' } }, failure);
  assert.equal(failure.statusCode, 503); assert.ok(released); assert.ok(!JSON.stringify(failure.body).includes('credential'));
  assert.deepEqual(parseTownResults([]), []);
});
test('approximate town points cannot satisfy exact GPS rules or monitoring verification', () => {
  assert.deepEqual(normalizeApproximateLocation(town), town);
  for (const value of [{ ...town, lat: null }, { ...town, precision: 'Exact' }, { ...town, lng: 70 }, { ...town, source: 'Google' }]) assert.throws(() => normalizeApproximateLocation(value));
  assert.equal(worksiteRequiresCoordinates({ approximateLocation: town }), true);
  assert.equal(locationCheck({ lat: 6.68, lng: -1.62 }, undefined).locationVerified, 'Site coordinates missing');
});
