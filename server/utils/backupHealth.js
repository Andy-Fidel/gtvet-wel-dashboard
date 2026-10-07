import { readFile } from 'node:fs/promises';

// The monitor publishes only a health flag and timestamp, never backup metadata.
export async function isBackupHealthy({
  filePath = '/app/backup-health/status.json',
  now = Date.now(),
} = {}) {
  try {
    const status = JSON.parse(await readFile(filePath, 'utf8'));
    if (status.healthy !== true || typeof status.checked_at !== 'string') return false;
    const age = now - Date.parse(status.checked_at);
    // Fail closed if the monitoring service stopped updating or its clock is wrong.
    return Number.isFinite(age) && age >= 0 && age <= 12 * 60 * 1000;
  } catch {
    return false;
  }
}
