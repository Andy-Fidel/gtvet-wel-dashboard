import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/User.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { hqRegistryOptions, partnerPortalSummaries } from '../utils/hqPartnerRegistry.js';
import router from '../routes/api.js';

test('HQ registry filters validate types and give stable global ordering', () => {
  assert.deepEqual(hqRegistryOptions({}).sort, { createdAt: -1, _id: 1 });
  const result = hqRegistryOptions({ partnerType: 'RegisteredCompany', partnerStatus: 'Inactive', attention: 'missingPrograms', sort: 'name-asc' });
  assert.deepEqual(result.sort, { name: 1, _id: 1 });
  assert.deepEqual(result.clauses[0], { status: 'Inactive' });
  assert.ok(result.clauses[1].$or.some(clause => clause.partnerType?.$exists === false));
  assert.deepEqual(result.clauses[2].$expr, { $eq: [{ $size: { $ifNull: ['$programs', []] } }, 0] });
  for (const input of [{ sort: '__proto__' }, { partnerType: 'Invalid' }, { partnerStatus: { $ne: '' } }, { attention: ['missingEmail'] }, { attention: 'Invalid' }]) {
    assert.throws(() => hqRegistryOptions(input), error => error.status === 400);
  }
});

test('portal summaries use one projected query and distinguish setup, delivery, suspension and email conflicts', async t => {
  let projection, calls = 0;
  const partners = ['new', 'setup', 'active', 'failed', 'suspended', 'conflict'].map(id => ({ _id: id, contactEmail: `${id}@example.test` }));
  t.mock.method(User, 'find', () => {
    calls++;
    return { select(value) { projection = value; return this; }, lean: async () => [
      { role: 'IndustryPartner', partnerId: 'setup', passwordChangeRequired: true, status: 'Active', email: 'setup@example.test', password: 'must-not-leak' },
      { role: 'IndustryPartner', partnerId: 'active', passwordChangeRequired: false, status: 'Active', email: 'active@example.test' },
      { role: 'IndustryPartner', partnerId: 'failed', passwordChangeRequired: true, status: 'Active', invitationDeliveryStatus: 'failed', email: 'failed@example.test' },
      { role: 'IndustryPartner', partnerId: 'suspended', status: 'Inactive', email: 'suspended@example.test' },
      { role: 'Staff', email: 'conflict@example.test', password: 'must-not-leak' },
    ] };
  });
  const summaries = await partnerPortalSummaries(partners, { emailConflicts: true });
  assert.equal(calls, 1);
  assert.equal(projection.includes('passwordChangeRequired'), true);
  assert.equal(projection.split(' ').includes('password'), false);
  assert.deepEqual(summaries.map(partner => partner.portalAccount.state), ['NotCreated', 'SetupPending', 'Active', 'DeliveryFailed', 'Suspended', 'EmailInUse']);
  assert.equal(JSON.stringify(summaries).includes('must-not-leak'), false);
  assert.deepEqual(await partnerPortalSummaries([]), []);
  assert.equal(calls, 1);
});

test('registry and all-page export share scoped filters and sorting, with independent scoped summaries', async t => {
  const finds = [], sorts = [], counts = [], aggregations = [], facets = [];
  t.mock.method(IndustryPartner, 'find', query => {
    finds.push(query);
    return { populate() { return this; }, sort(value) { sorts.push(value); return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  });
  t.mock.method(IndustryPartner, 'countDocuments', async query => { counts.push(query); return 19; });
  t.mock.method(IndustryPartner, 'aggregate', async pipeline => { aggregations.push(pipeline); return [{ total: 25, pending: 4, approved: 21, rejected: 0 }]; });
  t.mock.method(IndustryPartner, 'distinct', async (key, scope) => { facets.push(scope); return ['Automotive']; });
  const handler = router.stack.find(layer => layer.route?.path === '/industry-partners' && layer.route.methods.get).route.stack.at(-1).handle;
  const query = { registry: '1', includeAll: '1', region: 'Greater Accra', sector: 'Automotive', partnerType: 'Government', partnerStatus: 'Inactive', attention: 'missingEmail', sort: 'name-desc', q: 'A.*', approvalStatus: 'Approved' };
  const user = { role: 'HQStaff', hqScopeType: 'Region', region: 'Ashanti' };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const list = response();
  await handler({ user, query: { ...query, page: '2', pageSize: '18' } }, list);
  assert.equal(list.code, 200);
  assert.equal(list.body.totalPages, 2);
  assert.deepEqual(list.body.sectors, ['Automotive']);
  assert.equal(finds[0].$and[0].region.test('Ashanti'), true);
  assert.equal(finds[0].$and[1].region.test('Greater Accra'), true);
  assert.deepEqual(counts[0], finds[0]);
  assert.deepEqual(aggregations[0][0].$match, { $and: [finds[0].$and[0]] });
  assert.deepEqual(facets[0], finds[0].$and[0]);
  const exported = response();
  await handler({ user, query }, exported);
  assert.deepEqual(exported.body, []);
  assert.deepEqual(finds[1], finds[0]);
  assert.deepEqual(sorts, [{ name: -1, _id: 1 }, { name: -1, _id: 1 }]);
});


test('read-only portal summaries never look up unrelated email accounts', async t => {
  let query;
  t.mock.method(User, 'find', filter => { query = filter; return { select() { return this; }, lean: async () => [] }; });
  const [partner] = await partnerPortalSummaries([{ _id: 'scoped-partner', contactEmail: 'contact@example.test' }]);
  assert.deepEqual(query, { $or: [{ partnerId: { $in: ['scoped-partner'] } }] });
  assert.equal(partner.portalAccount.state, 'NotCreated');
});
