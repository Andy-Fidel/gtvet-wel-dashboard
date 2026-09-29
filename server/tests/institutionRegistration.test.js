import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import router from '../routes/api.js';
import authRouter from '../routes/authRoutes.js';
import { Institution } from '../models/Institution.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';

const handler = (method, path) => router.stack.find((layer) =>
  layer.route?.path === path && layer.route.methods[method.toLowerCase()]).route.stack.at(-1).handle;

const call = async (method, path, { user = { role: 'SuperAdmin' }, body = {}, query = {}, id = 'id' } = {}) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(method, path)({ user, body, query, params: { id } }, res);
  return res;
};

test('institution validation rejects blank identities, invalid status, and unmapped IDMS sync', async () => {
  const base = { name: 'Test School', code: 'TS-1', region: 'Ahafo', district: 'Test', location: 'Test', status: 'Day', gender: 'Mixed' };
  for (const change of [
    { name: '  ' }, { code: '  ' }, { status: 'Anything' }, { idmsSyncEnabled: true },
  ]) assert.ok(new Institution({ ...base, ...change }).validateSync());
  assert.equal(new Institution({ ...base, status: 'Day/Boarding' }).validateSync(), undefined);
  const normalized = new Institution({ ...base, name: '  Test School  ', code: 'ts-1' });
  await normalized.validate();
  assert.equal(normalized.nameKey, 'test school');
  assert.equal(normalized.codeKey, 'TS-1');
});

test('institution list respects HQ and regional scope even with a region query', async (t) => {
  const filters = [];
  t.mock.method(Institution, 'find', (filter) => {
    filters.push(filter);
    return { sort() { return this; }, lean: async () => [] };
  });
  const path = '/institutions';
  await call('GET', path, { user: { role: 'HQStaff', hqScopeType: 'Institution', institution: 'School A' } });
  await call('GET', path, { user: { role: 'HQManager', hqScopeType: 'Region', region: 'Ahafo' } });
  const otherRegion = await call('GET', path, { user: { role: 'RegionalAdmin', region: 'Ahafo' }, query: { region: 'Ashanti' } });
  assert.deepEqual(filters, [{ name: 'School A' }, { region: 'Ahafo' }]);
  assert.deepEqual(otherRegion.body, []);
});

test('institution names cannot be changed and institutions cannot be deleted', async (t) => {
  const institution = new Institution({ name: 'School A', code: 'SA-1', region: 'Ahafo', district: 'One', location: 'One', status: 'Day', gender: 'Mixed' });
  t.mock.method(Institution, 'findById', () => ({ select: async () => institution, then: (resolve) => Promise.resolve(institution).then(resolve) }));
  const rename = await call('PUT', '/institutions/:id', { body: { name: 'School B' } });
  assert.equal(rename.statusCode, 409);
  const deletion = await call('DELETE', '/institutions/:id');
  assert.equal(deletion.statusCode, 409);
});

test('checked-in institution CSV maps its headers and imports valid rows', async (t) => {
  const csv = readFileSync(fileURLToPath(new URL('../../Institutions data.csv', import.meta.url)), 'utf8');
  const created = [];
  t.mock.method(Institution, 'findOne', () => ({ select: async () => null }));
  t.mock.method(Institution.prototype, 'save', async function () { created.push(this); return this; });
  t.mock.method(AuditLog, 'create', async () => ({}));
  const result = await call('POST', '/institutions/import-csv', { body: { csv } });
  assert.equal(result.statusCode, 201, JSON.stringify(result.body));
  assert.equal(result.body.createdCount, 232, JSON.stringify(result.body));
  assert.deepEqual(result.body.skipped, [{ row: 171, reason: 'Missing location' }]);
  assert.equal(created[0].name, 'TSC Technical Institute, Goaso');
  assert.equal(created[0].code, '9060400');
  assert.equal(created[0].status, 'Day/Boarding');
  assert.ok(created[0].programs.length > 1);
});

test('CSV import rejects missing columns before writing and reports partial database failure', async (t) => {
  const saved = [];
  t.mock.method(Institution, 'findOne', () => ({ select: async () => null }));
  t.mock.method(Institution.prototype, 'save', async function () {
    if (this.code === 'TWO') throw new Error('database unavailable');
    saved.push(this);
    return this;
  });
  t.mock.method(AuditLog, 'create', async () => ({}));
  const path = '/institutions/import-csv';
  const invalid = await call('POST', path, { body: { csv: 'Institution,Region\nSchool A,Ahafo' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(saved.length, 0);
  const csv = 'name,code,region,district,location,gender,status\nSchool One,ONE,Ahafo,District,Town,Mixed,Day\nSchool Two,TWO,Ahafo,District,Town,Mixed,Day';
  const result = await call('POST', path, { body: { csv } });
  assert.equal(result.statusCode, 207);
  assert.equal(result.body.createdCount, 1);
  assert.equal(result.body.failedRow, 3);
  assert.equal(saved.length, 1);
});

test('admin registration requires a registered institution and cannot choose another role', async (t) => {
  const register = authRouter.stack.find((layer) => layer.route?.path === '/register').route.stack.at(-1).handle;
  const invoke = async (body) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await register({ user: { role: 'SuperAdmin' }, body }, res);
    return res;
  };
  t.mock.method(Institution, 'findOne', () => ({ select: async () => null }));
  const missing = await invoke({ name: 'Admin', email: 'admin@example.test', password: 'password123', institution: 'Unknown' });
  assert.equal(missing.statusCode, 400);
  t.mock.reset();
  t.mock.method(Institution, 'findOne', () => ({ select: async () => ({ _id: 'institution-id' }) }));
  t.mock.method(User, 'findOne', async () => null);
  let created;
  t.mock.method(User.prototype, 'save', async function () { created = this; return this; });
  t.mock.method(User, 'findById', () => ({ populate() { return this; }, then(resolve) { return Promise.resolve(created).then(resolve); } }));
  t.mock.method(AuditLog, 'create', async () => ({}));
  const result = await invoke({ name: 'Admin', email: 'admin@example.test', password: 'password123', institution: 'School A', role: 'SuperAdmin' });
  assert.equal(result.statusCode, 201, JSON.stringify(result.body));
  assert.equal(created.role, 'Admin');
  assert.equal(created.institution, 'School A');
});
