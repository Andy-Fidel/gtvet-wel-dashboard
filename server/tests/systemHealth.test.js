import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import router from '../routes/api.js';
import { runDiagnostics, createDiagnosticReader, checkLocalStorage, deploymentInfo, systemHealthHandler } from '../utils/systemHealth.js';

test('system health is HQ-only and protected by server role checks', async () => {
  const route = router.stack.find(layer => layer.route?.path === '/system-health').route;
  assert.equal(route.stack.at(-1).handle, systemHealthHandler);
  for (const role of [undefined, 'Admin', 'RegionalAdmin', 'Manager', 'Staff', 'Guardian', 'IndustryPartner', 'SuperAdmin', 'HQManager', 'HQStaff']) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
    let allowed = false;
    await route.stack[0].handle({ user: role ? { role } : undefined }, res, () => { allowed = true; });
    assert.equal(allowed, ['SuperAdmin', 'HQManager', 'HQStaff'].includes(role));
    if (!allowed) assert.equal(res.statusCode, 403);
  }
});

test('independent diagnostics survive errors, timeouts and unused services without exposing secrets', async () => {
  const result = await runDiagnostics([
    { id: 'api', probe: async () => ({ status: 'healthy', summary: 'Ready' }) },
    { id: 'email', probe: async () => { throw new Error('password=private-secret smtp://private-host'); } },
    { id: 'database', probe: () => new Promise(() => {}) },
    { id: 'prisma', probe: async () => ({ status: 'not_used', summary: 'Mongoose is used' }) },
  ], { timeoutMs: 10 });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.checks.map(check => check.status), ['healthy', 'failed', 'failed', 'not_used']);
  assert.ok(!JSON.stringify(result).includes('private-secret'));
  assert.ok(!JSON.stringify(result).includes('private-host'));
  assert.equal(result.checks[2].details[0].value, 'CHECK_TIMEOUT');
  assert.equal((await runDiagnostics([{ id: 'prisma', probe: async () => ({ status: 'not_used' }) }])).status, 'healthy');
});

test('concurrent reads share work and preserve the real check timestamp', async () => {
  let calls = 0;
  const read = createDiagnosticReader([{ id: 'api', probe: async () => { calls++; return { status: 'healthy' }; } }]);
  const [first, second] = await Promise.all([read(), read()]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal((await read()).checkedAt, first.checkedAt);
  assert.equal(calls, 1);
});

test('storage checks exercise real write/read, clean up and fail for missing storage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'system-health-'));
  try {
    const result = await checkLocalStorage(root);
    assert.ok(['healthy', 'warning'].includes(result.status));
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(checkLocalStorage(path.join(root, 'missing')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('build identity accepts only recorded commit and time; arbitrary environment values are not exposed', () => {
  const info = deploymentInfo({ APP_COMMIT: 'a'.repeat(40), APP_BUILD_TIME: '2026-10-07T15:00:00Z', NODE_ENV: 'production' });
  assert.equal(info.commit, 'a'.repeat(40));
  assert.equal(info.builtAt, '2026-10-07T15:00:00.000Z');
  const unknown = deploymentInfo({ APP_COMMIT: 'private-secret', APP_BUILD_TIME: 'unknown', NODE_ENV: 'private-secret' });
  assert.equal(unknown.commit, null);
  assert.equal(unknown.builtAt, null);
  assert.ok(!JSON.stringify(unknown).includes('private-secret'));
});
