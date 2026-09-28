import crypto from 'node:crypto';

const fingerprint = (value) => {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
};

export const logSecurityEvent = (event, req, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    event,
    method: req?.method || null,
    path: req?.originalUrl?.split('?')[0] || req?.path || null,
    status: details.status || null,
    ipFingerprint: fingerprint(req?.ip || req?.socket?.remoteAddress),
    requestId: req?.get?.('x-request-id') || null,
    ...details,
  };

  console.warn(JSON.stringify(entry));
};

