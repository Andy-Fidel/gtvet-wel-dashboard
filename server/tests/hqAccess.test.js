import test from 'node:test';
import assert from 'node:assert/strict';
import { canHQRequest, enforceHQAccess } from '../utils/hqAccess.js';
import { User } from '../models/User.js';
import { SemesterReport } from '../models/SemesterReport.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import router, { normalizeUserPayloadForRole } from '../routes/api.js';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

async function dispatch(role, method, path, routePath = path) {
  const req = { user: { role, _id: 'hq-user' }, method, path, params: { id: 'record-id' }, body: {} };
  const res = response();
  let allowed = false;
  enforceHQAccess(req, res, () => { allowed = true; });
  if (!allowed) return res;
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method.toLowerCase()])?.route;
  assert.ok(route, `Route exists: ${method} ${routePath}`);
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}

test('HQ roles require no institution; institution roles still do', () => {
  for (const role of ['HQManager', 'HQStaff']) {
    assert.equal(new User({ name: 'HQ User', email: 'hq@example.test', password: 'secret', role }).validateSync(), undefined);
  }
  for (const role of ['Manager', 'Staff']) {
    assert.ok(new User({ name: 'User', email: 'user@example.test', password: 'secret', role }).validateSync()?.errors.institution);
  }
});

test('only SuperAdmin can assign HQ roles and institution scopes are cleared', async () => {
  for (const role of ['HQManager', 'HQStaff']) {
    const payload = { role, institution: 'Old Institution', region: 'Old Region', partnerId: 'old-partner', linkedLearners: ['old-learner'] };
    const { normalized } = await normalizeUserPayloadForRole({ role: 'SuperAdmin' }, payload);
    assert.equal(normalized.role, role);
    assert.equal(normalized.institution, 'N/A');
    assert.equal(normalized.region, '');
    assert.equal(normalized.partnerId, undefined);
    assert.deepEqual(normalized.linkedLearners, []);
    for (const actor of ['RegionalAdmin', 'Admin', 'Manager', 'HQManager', 'HQStaff']) {
      assert.equal((await normalizeUserPayloadForRole({ role: actor }, payload)).status, 403);
    }
    assert.equal((await normalizeUserPayloadForRole({ role: 'Admin' }, { role: 'Staff' }, { role })).status, 403);
  }
});

test('HQ reads are national operations, never user or system administration', () => {
  for (const role of ['HQManager', 'HQStaff']) {
    for (const path of ['/learners', '/placements', '/admin/overview', '/semester-reports', '/industry-partners', '/documents']) {
      assert.equal(canHQRequest(role, 'GET', path), true);
    }
    for (const path of ['/users', '/Users/', '/users/registry', '/access-approvals', '/settings/system', '/settings/rollover/semester']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(canHQRequest(role, method, path), false);
    }
  }
});

test('all operational mutations denied except the four manager decisions', () => {
  const allowed = new Set([
    '/semester-reports/:id/hq-approve', '/semester-reports/:id/reject',
    '/industry-partners/:id/hq-approve', '/industry-partners/:id/hq-reject',
    '/notifications/read-all', '/notifications/:id/read',
  ]);
  for (const layer of router.stack.filter((entry) => entry.route)) {
    const route = layer.route;
    for (const method of Object.keys(route.methods).filter((value) => !['get', 'head', 'options'].includes(value))) {
      const path = route.path.replaceAll(':id', 'record-id');
      assert.equal(canHQRequest('HQManager', method.toUpperCase(), path), method === 'put' && allowed.has(route.path), `${method} ${path}`);
      assert.equal(canHQRequest('HQStaff', method.toUpperCase(), path), method === 'put' && path.startsWith('/notifications/'), `${method} ${path}`);
    }
  }
  assert.equal(canHQRequest('HQStaff', 'POST', '/documents/upload'), false);
  assert.equal(canHQRequest('HQManager', 'POST', '/industry-partners/id/create-account'), false);
});

test('manager reaches report decisions with national scope; staff and institution managers cannot', async (t) => {
  const filters = [];
  t.mock.method(SemesterReport, 'findOne', async (filter) => { filters.push(filter); return null; });
  for (const action of ['hq-approve', 'reject']) {
    const path = `/semester-reports/record-id/${action}`;
    const routePath = `/semester-reports/:id/${action}`;
    assert.equal((await dispatch('HQManager', 'PUT', path, routePath)).statusCode, 404);
    assert.deepEqual(filters.at(-1), { _id: 'record-id' });
    assert.equal((await dispatch('HQStaff', 'PUT', path, routePath)).statusCode, 403);
    assert.equal((await dispatch('Manager', 'PUT', path, routePath)).statusCode, 403);
  }
});

test('manager reaches partner decisions; staff cannot', async (t) => {
  t.mock.method(IndustryPartner, 'findById', async () => null);
  for (const action of ['hq-approve', 'hq-reject']) {
    const path = `/industry-partners/record-id/${action}`;
    const routePath = `/industry-partners/:id/${action}`;
    assert.equal((await dispatch('HQManager', 'PUT', path, routePath)).statusCode, 404);
    assert.equal((await dispatch('HQStaff', 'PUT', path, routePath)).statusCode, 403);
  }
});

test('SuperAdmin remains unrestricted and HQ guard precedes every API endpoint', () => {
  assert.equal(canHQRequest('SuperAdmin', 'DELETE', '/users/id'), true);
  assert.equal(canHQRequest('SuperAdmin', 'PUT', '/settings/system'), true);
  assert.equal(router.stack[1].handle, enforceHQAccess);
});
