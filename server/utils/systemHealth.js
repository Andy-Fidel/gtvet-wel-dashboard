import mongoose from 'mongoose';
import { mkdtemp, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Notification } from '../models/Notification.js';
import { NotificationSchedule } from '../models/NotificationSchedule.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { isMailerConfigured, verifyMailerDiagnostics } from './mailer.js';
import { isWebPushConfigured } from './webPush.js';
import { isBackupHealthy } from './backupHealth.js';
import { NOTIFICATION_MAX_ATTEMPTS } from './notifications.js';

const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const connected = () => { if (mongoose.connection.readyState !== 1) throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_UNAVAILABLE' }); };
const detail = (label, value) => ({ label, value: String(value) });

export async function checkLocalStorage(root = path.resolve(process.env.LOCAL_UPLOAD_DIR || fileURLToPath(new URL('../local-uploads', import.meta.url)))) {
  let temporary;
  try {
    temporary = await mkdtemp(path.join(root, '.health-'));
    const file = path.join(temporary, 'probe');
    await writeFile(file, 'GTVET storage check', { mode: 0o600, flag: 'wx' });
    if (await readFile(file, 'utf8') !== 'GTVET storage check') throw new Error('Storage verification failed');
    const disk = await statfs(root);
    const available = Number(disk.bavail) * Number(disk.bsize);
    const capacity = Number(disk.blocks) * Number(disk.bsize);
    const lowSpace = capacity > 0 && available / capacity < 0.15;
    return { status: lowSpace ? 'warning' : 'healthy', summary: 'File write and read verified.',
      details: [detail('Storage', 'Persistent local uploads'), detail('Available space', `${(available / 1024 ** 3).toFixed(1)} GB`)],
      action: lowSpace ? 'Ask your server administrator to free space or expand storage.' : null };
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

export function deploymentInfo(env = process.env) {
  const commit = /^[a-f0-9]{40}$/i.test(env.APP_COMMIT || '') ? env.APP_COMMIT : null;
  const builtAt = env.APP_BUILD_TIME && Number.isFinite(Date.parse(env.APP_BUILD_TIME)) ? new Date(env.APP_BUILD_TIME).toISOString() : null;
  return { version: packageVersion, commit, builtAt, runtime: process.version,
    environment: ['production', 'development', 'test'].includes(env.NODE_ENV) ? env.NODE_ENV : 'development' };
}

async function queueCheck() {
  connected();
  const [rows, heartbeat] = await Promise.all([
    Notification.aggregate([
      { $match: { $or: [{ pushStatus: { $in: ['pending', 'failed'] } }, { whatsAppStatus: { $in: ['pending', 'failed'] } }] } },
      { $group: { _id: null,
        pending: { $sum: { $add: ['push', 'whatsApp'].map(channel => ({ $cond: [{ $and: [{ $in: [`$${channel}Status`, ['pending', 'failed']] }, { $lt: [{ $ifNull: [`$${channel}Attempts`, 0] }, NOTIFICATION_MAX_ATTEMPTS] }] }, 1, 0] })) } },
        exhausted: { $sum: { $add: ['push', 'whatsApp'].map(channel => ({ $cond: [{ $and: [{ $eq: [`$${channel}Status`, 'failed'] }, { $gte: [{ $ifNull: [`$${channel}Attempts`, 0] }, NOTIFICATION_MAX_ATTEMPTS] }] }, 1, 0] })) } },
      } },
    ]).option({ maxTimeMS: 2000 }),
    NotificationSchedule.findOne({ key: 'delivery-worker-health' }).select('lastCompletedAt lastFailedAt').maxTimeMS(2000).lean(),
  ]);
  const counts = rows[0] || { pending: 0, exhausted: 0 };
  const completedAt = heartbeat?.lastCompletedAt ? new Date(heartbeat.lastCompletedAt) : null;
  const age = completedAt ? Date.now() - completedAt.getTime() : Infinity;
  const active = age >= 0 && age <= 5 * 60000;
  const failedRecently = heartbeat?.lastFailedAt && (!completedAt || new Date(heartbeat.lastFailedAt) > completedAt);
  const warning = !active || failedRecently || counts.exhausted > 0;
  return { status: warning ? 'warning' : 'healthy', summary: active ? 'Notification worker has a recent successful run.' : 'No successful worker run within the last five minutes.',
    details: [detail('Queue', 'MongoDB-backed notification delivery'), detail('Waiting / retrying', counts.pending), detail('Retries exhausted', counts.exhausted), detail('Last successful run', completedAt?.toISOString() || 'Not recorded yet')],
    action: warning ? 'Ask your administrator to check the notification worker and failed deliveries.' : null };
}

async function pushCheck() {
  if (!isWebPushConfigured()) return { status: 'not_configured', summary: 'Browser push is not configured.', action: 'Ask your administrator to configure browser push keys.' };
  connected();
  const since = new Date(Date.now() - 86400000);
  const [subscriptions, failures] = await Promise.all([
    PushSubscription.countDocuments({}).maxTimeMS(2000),
    Notification.countDocuments({ createdAt: { $gte: since }, pushStatus: 'failed' }).maxTimeMS(2000),
  ]);
  return { status: failures ? 'warning' : 'healthy', summary: 'Push key configuration validated; delivery history checked.',
    details: [detail('Subscribed devices', subscriptions), detail('Failed notifications in last 24 hours', failures), detail('Verification', 'Configuration and history; no test push sent')],
    action: failures ? 'Review failed push deliveries. Device permission and subscriptions affect delivery.' : null };
}

export const healthProbes = [
  { id: 'api', label: 'API', description: 'Authenticated application response', probe: async () => ({ status: 'healthy', summary: 'The API is responding to this authenticated request.', details: [detail('Process uptime', `${Math.floor(process.uptime() / 60)} minutes`)] }) },
  { id: 'database', label: 'Database', description: 'MongoDB connectivity', probe: async () => { connected(); await mongoose.connection.db.admin().command({ ping: 1 }, { maxTimeMS: 2000 }); return { status: 'healthy', summary: 'MongoDB responded to a live ping.' }; } },
  { id: 'mongoose', label: 'Mongoose', description: 'Application data access', probe: async () => { connected(); await Notification.findOne().select('_id').maxTimeMS(2000).lean(); return { status: 'healthy', summary: 'A read through the application’s data layer succeeded.', details: [detail('Mongoose version', mongoose.version)] }; } },
  { id: 'prisma', label: 'Prisma', description: 'Database tooling', probe: async () => ({ status: 'not_used', summary: 'This application uses MongoDB with Mongoose. Prisma is not installed.' }) },
  { id: 'queue', label: 'Queue', description: 'Background notification work', probe: queueCheck },
  { id: 'storage', label: 'Storage', description: 'Upload write, read and disk space', probe: () => checkLocalStorage() },
  { id: 'push', label: 'Push notifications', description: 'Configuration and recent failures', probe: pushCheck },
  { id: 'email', label: 'Email', description: 'SMTP connection and authentication', probe: async () => {
    if (!isMailerConfigured()) return { status: 'not_configured', summary: 'Outgoing email is not configured.', action: 'Ask your administrator to configure outgoing email.' };
    if (await verifyMailerDiagnostics() !== true) throw new Error('SMTP verification failed');
    return { status: 'healthy', summary: 'SMTP connection and authentication verified.', details: [detail('Verification', 'No email sent; inbox delivery is not tested')] };
  } },
  { id: 'backups', label: 'Backups', description: 'Verified backup and monitor freshness', probe: async () => {
    const healthy = await isBackupHealthy();
    return { status: healthy ? 'healthy' : 'warning', summary: healthy ? 'The server backup monitor reports healthy, recent checks.' : 'Recent healthy backup checks could not be confirmed.', action: healthy ? null : 'For backup incidents, review the GTVET WEL backup monitor in UptimeRobot.' };
  } },
  { id: 'version', label: 'App version', description: 'Running build identity', probe: async () => {
    const info = deploymentInfo();
    return { status: info.commit && info.builtAt ? 'healthy' : 'warning', summary: info.commit && info.builtAt ? 'This instance has recorded deployment metadata.' : 'The build commit or build time was not recorded.',
      details: [detail('Package version', info.version), detail('Commit', info.commit?.slice(0, 12) || 'Not recorded'), detail('Build time', info.builtAt || 'Not recorded'), detail('Node.js', info.runtime)],
      action: info.commit && info.builtAt ? null : 'Record the commit and build time during the next deployment.' };
  } },
];

export async function runDiagnostics(probes, { timeoutMs = 8000 } = {}) {
  const checkedAt = new Date().toISOString();
  const checks = await Promise.all(probes.map(async ({ id, label, description, probe }) => {
    const started = performance.now();
    let timer;
    try {
      const result = await Promise.race([Promise.resolve().then(probe), new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'CHECK_TIMEOUT' })), timeoutMs); })]);
      return { id, label, description, details: [], action: null, ...result, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      // Never expose exception strings, connection URIs, credentials or provider responses.
      const allowedCodes = new Set(['DATABASE_UNAVAILABLE', 'CHECK_TIMEOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAUTH', 'ENOENT', 'EACCES', 'ENOSPC', 'EROFS']);
      const code = allowedCodes.has(error?.code) ? error.code : 'CHECK_FAILED';
      const durationMs = Math.round(performance.now() - started);
      console.warn('System health check failed', { service: id, code, durationMs });
      return { id, label, description, status: 'failed', summary: 'This check failed or timed out.', details: [detail('Failure code', code)], action: 'Contact your system administrator to check this service and its server logs.', durationMs };
    } finally { clearTimeout(timer); }
  }));
  const status = checks.some(c => c.status === 'failed') ? 'failed' : checks.some(c => ['warning', 'not_configured'].includes(c.status)) ? 'warning' : 'healthy';
  return { checkedAt, status, checks, deployment: deploymentInfo(), refreshAfterSeconds: 60 };
}

export function createDiagnosticReader(probes = healthProbes, options = {}) {
  let cached, inFlight;
  return async () => {
    if (cached && Date.now() - cached.savedAt < 15000) return cached.value;
    if (inFlight) return inFlight;
    inFlight = runDiagnostics(probes, options).then(value => { cached = { value, savedAt: Date.now() }; return value; }).finally(() => { inFlight = null; });
    return inFlight;
  };
}

export const readSystemHealth = createDiagnosticReader();
export async function systemHealthHandler(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await readSystemHealth());
}
