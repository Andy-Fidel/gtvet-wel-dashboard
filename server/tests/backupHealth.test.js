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
