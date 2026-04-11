import { AuditLog } from '../models/AuditLog.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'defaultPassword',
  '__v',
]);

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value.toObject === 'function') {
    return sanitize(value.toObject());
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      result[key] = sanitize(nestedValue);
    }
    return result;
  }
  return value;
}

export function diffFields(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

export async function logAuditEvent({
  req,
  actor,
  action,
  entityType,
  entityId,
  summary,
  before = null,
  after = null,
  metadata = {},
  changedFields = null,
}) {
  try {
    const currentActor = actor || req?.user;

    const cleanBefore = before ? sanitize(before) : undefined;
    const cleanAfter = after ? sanitize(after) : undefined;
    const fallbackActor = {
      _id: undefined,
      name: metadata?.actorName || metadata?.email || 'Unknown Actor',
      role: metadata?.actorRole || 'Unknown',
      institution: metadata?.institution || 'N/A',
      region: metadata?.region || '',
      partnerId: metadata?.partnerId || undefined,
    };
    const actorDetails = currentActor || fallbackActor;

    await AuditLog.create({
      action,
      entityType,
      entityId: String(entityId),
      summary,
      actorId: actorDetails._id,
      actorName: actorDetails.name || 'System',
      actorRole: actorDetails.role || 'System',
      institution: actorDetails.institution || 'N/A',
      region: actorDetails.region || '',
      partnerId: actorDetails.partnerId?._id || actorDetails.partnerId || undefined,
      route: req?.originalUrl || '',
      method: req?.method || '',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
      changedFields: changedFields || diffFields(cleanBefore, cleanAfter),
      beforeData: cleanBefore,
      afterData: cleanAfter,
      metadata: sanitize(metadata),
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
