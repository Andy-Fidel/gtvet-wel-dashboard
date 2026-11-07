import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isBackupHealthy } from '../utils/backupHealth.js';

test('backup health fails closed for stale, missing, malformed and unhealthy status', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'backup-health-'));
  const filePath = path.join(directory, 'status.json');
  const now = Date.now();
  try {
    assert.equal(await isBackupHealthy({ filePath, now }), false);
    for (const [healthy, offset, expected] of [
      [true, 60_000, true],
      [true, 13 * 60_000, false],
      [true, -60_000, false],
      [false, 60_000, false],
    ]) {
      await writeFile(filePath, JSON.stringify({ healthy, checked_at: new Date(now - offset).toISOString() }));
      assert.equal(await isBackupHealthy({ filePath, now }), expected);
    }
    await writeFile(filePath, '{bad json');
    assert.equal(await isBackupHealthy({ filePath, now }), false);
    await writeFile(filePath, JSON.stringify({ healthy: true, checked_at: 'invalid' }));
    assert.equal(await isBackupHealthy({ filePath, now }), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('diagnostics allowlist monitor results and fail closed on invalid evidence', async () => {
  const { readBackupHealth, createBackupHealthHandler } = await import('../utils/backupHealth.js');
  const { checkBackupProtection, runDiagnostics } = await import('../utils/systemHealth.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'backup-health-'));
  const filePath = path.join(directory, 'status.json');
  const now = Date.now();
  const options = { filePath, now };
  const checks = { external_backup: true, disk_space: true, application: true };
  const valid = { healthy: true, checked_at: new Date(now).toISOString(), checks };
  const cases = [
    [null, 'STATUS_MISSING'],
    ['{bad json', 'STATUS_INVALID'],
    ['null', 'STATUS_INVALID'],
    [{ ...valid, checked_at: 'secret' }, 'TIMESTAMP_INVALID'],
    [{ ...valid, checked_at: new Date(now + 1).toISOString() }, 'TIMESTAMP_FUTURE'],
    [{ ...valid, checked_at: new Date(now - 720001).toISOString() }, 'STATUS_STALE'],
    [{ ...valid, checks: {} }, 'STATUS_INVALID'],
    [{ ...valid, checks: { ...checks, application: 'true' } }, 'STATUS_INVALID'],
    [{ ...valid, checks: { ...checks, application: false } }, 'STATUS_INCONSISTENT'],
    [{ ...valid, healthy: false }, 'STATUS_INCONSISTENT'],
    [{ ...valid, healthy: false, checks: { ...checks, external_backup: false } }, 'MONITOR_FAILED'],
    [{ ...valid, healthy: false, checks: { ...checks, disk_space: false } }, 'MONITOR_FAILED'],
    [{ ...valid, healthy: false, checks: { ...checks, application: false } }, 'MONITOR_FAILED'],
    [{ ...valid, checked_at: new Date(now - 720000).toISOString() }, 'OK'],
    [valid, 'OK'],
  ];
  try {
    for (const [input, code] of cases) {
      if (input !== null) {
        const payload = typeof input === 'string' ? input : JSON.stringify({
          ...input, path: '/private/secret', name: 'secret', credentials: 'secret',
          ...(input.checks ? { checks: { ...input.checks, '/private/secret': 'secret' } } : {}),
        });
        await writeFile(filePath, payload);
      }
      const result = await readBackupHealth(options);
      assert.equal(result.code, code);
      assert.equal(result.healthy, code === 'OK');
      const report = await runDiagnostics([{ id: 'backups', probe: () => checkBackupProtection(options) }]);
      assert.equal(report.status, code === 'OK' ? 'healthy' : 'warning');
      assert.ok(!JSON.stringify(report).includes('secret'));
      if (code === 'MONITOR_FAILED') {
        const failed = Object.keys(input.checks).find(id => !input.checks[id]);
        assert.deepEqual(result.checks.filter(check => !check.healthy), [{ id: failed, healthy: false }]);
        assert.ok(report.checks[0].details.some(detail => detail.value === 'Failed'));
      }
      const response = { set(key, value) { assert.equal(key, 'Cache-Control'); assert.equal(value, 'no-store'); }, status(value) { this.code = value; return this; }, json(value) { this.body = value; } };
      await createBackupHealthHandler(options)({}, response);
      assert.equal(response.code, code === 'OK' ? 200 : 503);
      assert.deepEqual(response.body, { status: code === 'OK' ? 'ok' : 'unavailable' });
    }
    assert.equal((await readBackupHealth({ filePath: directory, now })).code, 'STATUS_UNREADABLE');
    // Aggregate-only reports remain usable during a rolling monitor upgrade.
    await writeFile(filePath, JSON.stringify({ healthy: true, checked_at: valid.checked_at }));
    const legacy = await checkBackupProtection(options);
    assert.equal(legacy.status, 'healthy');
    assert.ok(legacy.details.some(item => item.value === 'Unavailable'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
