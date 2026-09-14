import test from 'node:test';
import assert from 'node:assert/strict';
import { Institution } from '../models/Institution.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { partnerRegionMatch, partnerVisibilityFilter } from '../utils/partnerVisibility.js';
import router from '../routes/api.js';

test('Greater Accra aliases match both directions without including other regions', () => {
  for (const region of ['G. Accra', 'Greater Accra', ' greater  accra region ']) {
    const match = partnerRegionMatch(region);
    for (const value of ['G. Accra', 'Greater Accra', 'GREATER ACCRA', 'Greater Accra Region']) assert.ok(match.test(value));
    for (const value of ['Eastern', 'Ashanti', 'Accra Central', 'Western North']) assert.equal(match.test(value), false);
  }
  assert.equal(partnerRegionMatch('Western').test('Western North'), false);
  assert.deepEqual(partnerRegionMatch(''), { $in: [] });
});

test('institution region is authoritative for every institutional role, with linked partners retained', async t => {
  t.mock.method(Institution, 'findOne', filter => {
    assert.deepEqual(filter, { name: 'Accra Institute' });
    return { select() { return this; }, lean: async () => ({ region: 'G. Accra' }) };
  });
  for (const role of ['Admin', 'Manager', 'Staff', 'HQManager', 'HQStaff']) {
    const filter = await partnerVisibilityFilter({ role, institution: 'Accra Institute', region: 'Ashanti', hqScopeType: 'Institution' });
    assert.deepEqual(filter.$or[0], { linkedInstitutions: 'Accra Institute' });
    assert.ok(filter.$or[1].region.test('Greater Accra'));
    assert.equal(filter.$or[1].region.test('Ashanti'), false);
    assert.deepEqual(filter.$or[1].$or, [{ approvalStatus: 'Approved' }, { approvalStatus: { $exists: false } }]);
  }
});

test('regional scopes match aliases, missing scope and unsupported roles fail closed', async () => {
  for (const role of ['RegionalAdmin', 'HQManager', 'HQStaff']) {
    assert.ok((await partnerVisibilityFilter({ role, region: 'G. Accra', hqScopeType: 'Region' })).region.test('Greater Accra'));
  }
  assert.deepEqual(await partnerVisibilityFilter({ role: 'Staff' }), { _id: { $in: [] } });
  assert.deepEqual(await partnerVisibilityFilter({ role: 'Guardian' }), { _id: { $in: [] } });
  assert.deepEqual(await partnerVisibilityFilter({ role: 'SuperAdmin' }), {});
});

test('list and search use the same institution regional visibility', async t => {
  t.mock.method(Institution, 'findOne', () => ({ select() { return this; }, lean: async () => ({ region: 'G. Accra' }) }));
  const observed = [];
  t.mock.method(IndustryPartner, 'find', filter => {
    observed.push(filter);
    return { populate() { return this; }, sort() { return this; }, select() { return this; }, limit() { return this; }, lean: async () => [], then(resolve) { resolve([]); } };
  });
  for (const path of ['/industry-partners', '/industry-partners/search']) {
    const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;
    const res = { json() {}, status(code) { assert.fail(`unexpected ${code}`); } };
    await handler({ user: { role: 'Staff', institution: 'Accra Institute' }, query: { q: 'Company' } }, res);
  }
  assert.deepEqual(observed[0].$and[0], observed[1].$and[0]);
  assert.equal(observed[0].status, 'Active');
});
