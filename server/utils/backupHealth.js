import { readFile } from 'node:fs/promises';

export const BACKUP_CHECK_LABELS = Object.freeze({
  external_backup: 'Recently verified external backup',
  disk_space: 'Backup filesystem capacity',
  application: 'Application health',
});

// Treat the file as untrusted: return only fixed codes and boolean check results.
export async function readBackupHealth({
  filePath = '/app/backup-health/status.json',
  now = Date.now(),
} = {}) {
  const failed = code => ({ healthy: false, code, checks: [] });
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    return failed(error?.code === 'ENOENT' ? 'STATUS_MISSING' : 'STATUS_UNREADABLE');
  }
  let status;
  try { status = JSON.parse(raw); } catch { return failed('STATUS_INVALID'); }
  if (!status || typeof status.healthy !== 'boolean' || typeof status.checked_at !== 'string') return failed('STATUS_INVALID');
  const age = now - Date.parse(status.checked_at);
  if (!Number.isFinite(age)) return failed('TIMESTAMP_INVALID');
  if (age < 0) return failed('TIMESTAMP_FUTURE');
  if (age > 12 * 60 * 1000) return failed('STATUS_STALE');
  let checks = [];
  // Older monitors publish only the aggregate. Preserve compatibility without
  // inventing individual successes; new reports must include every known check.
  if (Object.hasOwn(status, 'checks')) {
    if (!status.checks || Array.isArray(status.checks) || typeof status.checks !== 'object'
      || !Object.keys(BACKUP_CHECK_LABELS).every(id => typeof status.checks[id] === 'boolean')) return failed('STATUS_INVALID');
    checks = Object.keys(BACKUP_CHECK_LABELS).map(id => ({ id, healthy: status.checks[id] }));
    if (status.healthy !== checks.every(check => check.healthy)) return failed('STATUS_INCONSISTENT');
  }
  return { healthy: status.healthy, code: status.healthy ? 'OK' : 'MONITOR_FAILED', checks };
}

export async function isBackupHealthy(options) {
  return (await readBackupHealth(options)).healthy;
}

export function createBackupHealthHandler(options) {
  return async (_req, res) => {
    const healthy = await isBackupHealthy(options);
    res.set('Cache-Control', 'no-store');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable' });
  };
}

export const backupHealthHandler = createBackupHealthHandler();
