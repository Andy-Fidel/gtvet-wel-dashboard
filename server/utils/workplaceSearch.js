import crypto from 'node:crypto';
import { TownLookupCache, TownLookupGate } from '../models/TownLookup.js';
import { normalizeApproximateLocation } from './townLocation.js';

const storage = {
  async read(key) { return (await TownLookupCache.findOne({ _id: key, expiresAt: { $gt: new Date() } }).maxTimeMS(2000).lean())?.results; },
  async write(key, results) { await TownLookupCache.updateOne({ _id: key }, { $set: { results, expiresAt: new Date(Date.now() + 7 * 86400000) } }, { upsert: true, maxTimeMS: 2000 }); },
  async acquire() {
    const token = crypto.randomUUID();
    try {
      const gate = await TownLookupGate.findOneAndUpdate({ _id: 'nominatim', nextAt: { $lte: new Date() } },
        { $set: { token, nextAt: new Date(Date.now() + 20000) } }, { upsert: true, returnDocument: 'after', maxTimeMS: 2000 });
      return gate?.token === token ? token : null;
    } catch (error) {
      // A losing upsert or collection-creation write conflict never authorizes a request.
      if ([11000, 112].includes(error.code)) return null;
      throw error;
    }
  },
  async release(token) { await TownLookupGate.updateOne({ _id: 'nominatim', token }, { $set: { nextAt: new Date(Date.now() + 1100) } }, { maxTimeMS: 2000 }); },
};

export function parseTownResults(data) {
  if (!Array.isArray(data)) throw new Error('Invalid lookup response');
  const settlementTypes = ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'municipality', 'borough', 'district'];
  return data.filter(item => item.address?.country_code === 'gh' && settlementTypes.includes(item.addresstype || item.type)
    && typeof item.lat === 'string' && item.lat.trim() && typeof item.lon === 'string' && item.lon.trim()).flatMap(item => {
    try { return [normalizeApproximateLocation({ name: item.display_name, lat: Number(item.lat), lng: Number(item.lon),
      source: 'OpenStreetMap', precision: 'Town', osmType: item.osm_type, osmId: String(item.osm_id) })]; } catch { return []; }
  }).slice(0, 5);
}

export function createWorkplaceSearchHandler({ fetchImpl = fetch, store = storage, env = process.env } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const query = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : '';
    if (query.length < 3 || query.length > 160 || !/^[\p{L}\p{M}\s,.'’()-]+$/u.test(query)) {
      return res.status(400).json({ message: 'Enter a town or area name (3–160 characters). Do not enter personal details or a private address.' });
    }
    if (env.TOWN_LOOKUP_ENABLED === 'false') return res.status(503).json({ message: 'Town search is currently unavailable. You can enter the town manually.' });
    let token;
    try {
      const url = new URL('/search', env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org');
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid provider configuration');
      const key = crypto.createHash('sha256').update(`${url.origin}|${query.toLowerCase()}`).digest('hex');
      const cached = await store.read(key);
      if (cached) return res.json({ results: cached });
      token = await store.acquire();
      if (!token) { res.set('Retry-After', '2'); return res.status(429).json({ message: 'Town search is busy. Please wait a moment and try again.' }); }
      // Another worker may have populated this query while we acquired the gate.
      const latest = await store.read(key);
      if (latest) return res.json({ results: latest });
      url.search = new URLSearchParams({ q: query, countrycodes: 'gh', format: 'jsonv2', addressdetails: '1', limit: '10', 'accept-language': 'en', layer: 'address' }).toString();
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(6000), redirect: 'error',
        headers: { 'User-Agent': env.NOMINATIM_USER_AGENT || 'GTVET-WEL/1.0 (+https://wel.gtvets.gov.gh)', Accept: 'application/json' } });
      if (!response.ok) throw new Error('Lookup unavailable');
      const results = parseTownResults(await response.json());
      await store.write(key, results);
      return res.json({ results });
    } catch (error) {
      const code = error?.code === 50 ? 'DATABASE_TIMEOUT' : error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'LOOKUP_FAILED';
      console.warn('Town lookup failed', { code });
      return res.status(503).json({ message: 'Town search is temporarily unavailable. Try again later or enter the town manually.' });
    } finally {
      if (token) { try { await store.release(token); } catch { /* Fail closed until the reservation expires. */ } }
    }
  };
}
export const workplaceSearchHandler = createWorkplaceSearchHandler();
