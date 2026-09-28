import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logSecurityEvent } from '../utils/securityEvents.js';

const SENSITIVE_POST_PATHS = new Set([
  '/register',
  '/login',
  '/change-password',
  '/forgot-password',
  '/security/mfa/setup',
  '/security/mfa/enable',
  '/security/mfa/disable',
  '/inspection/start',
]);

const pathOnly = (path = '') => {
  const clean = String(path).split('?')[0].replace(/^\/api\/auth/i, '');
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`;
  return (withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash).toLowerCase();
};

export const isSensitiveAuthRequest = (method, path) => {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedPath = pathOnly(path);

  if (normalizedMethod === 'PUT' && /^\/reset-password\/[^/]+$/.test(normalizedPath)) return true;
  if (normalizedMethod !== 'POST') return false;
  if (SENSITIVE_POST_PATHS.has(normalizedPath)) return true;
  return /^\/security\/(sessions\/[^/]+\/revoke|users\/[^/]+\/revoke-all)$/.test(normalizedPath);
};

const hashKeyPart = (value) => crypto
  .createHash('sha256')
  .update(String(value))
  .digest('hex')
  .slice(0, 24);

export const authRateLimitKey = (req) => {
  const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
  const normalizedPath = pathOnly(req.originalUrl || req.path);
  let accountTarget = null;

  if (typeof req.body?.email === 'string') {
    accountTarget = req.body.email.trim().toLowerCase();
  } else if (normalizedPath.startsWith('/reset-password/')) {
    accountTarget = normalizedPath.slice('/reset-password/'.length);
  }

  return accountTarget ? `${ip}:${hashKeyPart(accountTarget)}` : ip;
};

export const createSensitiveAuthLimiter = ({ windowMs, max }) => {
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: authRateLimitKey,
    handler: (req, res, _next, options) => {
      const resetTime = req.rateLimit?.resetTime?.getTime?.();
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      const message = 'Too many authentication attempts for this account. Please wait and try again.';

      logSecurityEvent('auth_rate_limit_rejected', req, {
        status: options.statusCode,
        limit: max,
        windowMs,
        retryAfterSeconds,
      });
      res.status(options.statusCode).json({ message, retryAfterSeconds });
    },
  });

  return (req, res, next) => {
    if (!isSensitiveAuthRequest(req.method, req.originalUrl || req.path)) return next();
    return limiter(req, res, next);
  };
};
