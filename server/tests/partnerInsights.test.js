import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Placement } from '../models/Placement.js';
import { PlacementRequest } from '../models/PlacementRequest.js';

async function run(user) {
  const route = router.stack.find(layer => layer.route?.path === '/hq/partner-insights').route;
  const res = { code: 200, status(code) { this.code = code; return this; }, set() { return this; }, json(body) { this.body = body; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle({ user }, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}
test('partner insights deny non-HQ roles and incomplete HQ scopes', async () => {
  for (const role of ['Admin', 'Manager', 'Staff', 'RegionalAdmin', 'Guardian', 'IndustryPartner']) {
    assert.equal((await run({ role })).code, 403);
  }
  assert.equal((await run({ role: 'HQStaff', hqScopeType: 'Institution' })).code, 403);
  assert.equal((await run({ role: 'HQManager', hqScopeType: 'Region' })).code, 403);
});
test('institution HQ insights constrain every query and handle empty records', async t => {
  t.mock.method(IndustryPartner, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline[0].$match, { linkedInstitutions: 'Pilot' });
    return [{ summary: [], regions: [], sectors: [] }];
  });
  for (const model of [Placement, PlacementRequest]) t.mock.method(model, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline[0].$match, { institution: 'Pilot', archivedAt: null });
    return [];
  });
  const result = await run({ role: 'HQStaff', hqScopeType: 'Institution', institution: 'Pilot' });
  assert.equal(result.code, 200);
  assert.deepEqual(result.body.summary, { partnersWithPlacements: 0 });
  assert.deepEqual(result.body.placements, []);
});
