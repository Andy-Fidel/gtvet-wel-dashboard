import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { PlacementRequest } from '../models/PlacementRequest.js';

const route = router.stack.find(layer => layer.route?.path === '/placement-requests/:id' && layer.route.methods.get).route;

async function dispatch({ id = '507f1f77bcf86cd799439011', user = { role: 'Admin', institution: 'Accra Technical Institute' } } = {}) {
  const req = { params: { id }, user };
  const res = {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  await route.stack.at(-1).handle(req, res);
  return res;
}

test('placement batch details reject malformed identifiers before database access', async t => {
  t.mock.method(PlacementRequest, 'findOne', () => assert.fail('database should not be queried'));
  const result = await dispatch({ id: 'invalid' });
  assert.equal(result.statusCode, 400);
});

test('placement batch details retain institution scope and include converted learner placements', async t => {
  let observedFilter;
  const record = { _id: 'batch', startDate: new Date('2026-10-01'), endDate: new Date('2026-12-01'), learners: [], convertedPlacementIds: [] };
  t.mock.method(PlacementRequest, 'findOne', filter => {
    observedFilter = filter;
    return { populate() { return this; }, lean: async () => record };
  });
  const result = await dispatch();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(observedFilter, { _id: '507f1f77bcf86cd799439011', institution: 'Accra Technical Institute' });
  assert.equal(result.body, record);
});
