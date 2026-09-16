import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { credentialVersion } from '../utils/authSessions.js';
import { MfaCredential } from '../models/MfaCredential.js';
import { inspectionParent } from '../utils/inspection.js';
import { inspectionContext } from '../utils/inspectionContext.js';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  const message = 'JWT_SECRET is not configured. Using an ephemeral in-memory secret; all tokens will be invalid after restart.';
  if (process.env.NODE_ENV === 'production') {
    console.error(`CRITICAL ERROR: ${message}`);
    process.exit(1);
  }
  console.warn(`Security warning: ${message}`);
}

// Verify JWT token and attach user to request
export const auth = async (req, res, next) => {
  try {
    const token = getRequestToken(req);
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const userId = decoded.userId;
    if (typeof decoded.sid !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.sid)) {
      return res.status(401).json({ message: 'Please sign in again to establish a secure session.' });
    }
    const [user, session, mfa] = await Promise.all([
      User.findById(userId).select('+sessionVersion')
        .populate('partnerId')
        .populate('linkedLearners', 'name trackingId institution'),
      AuthSession.findOne({ _id: decoded.sid, userId, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+credentialVersion'),
      MfaCredential.exists({ userId, enabled: true }),
    ]);
    
    if (!user || user.status !== 'Active' || !session || (mfa && !session.mfaVerified && !session.parentSessionId) || session.credentialVersion !== credentialVersion(user)) {
      return res.status(401).json({ message: 'Invalid token or inactive user' });
    }

    if (session.parentSessionId) {
      const parent = await inspectionParent(session.parentSessionId, session.inspectorId);
      if (!parent) return res.status(401).json({ message: 'Inspection authorization has ended.' });
      req.inspectionActor = parent.user;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.originalUrl?.startsWith('/api/auth/security')) {
        return res.status(403).json({ message: 'Inspection mode is read-only. Return to Super Admin to make changes.' });
      }
    }
    if (req.headers['x-session-user'] && req.headers['x-session-user'] !== String(user._id)) {
      return res.status(409).json({ code: 'SESSION_CONTEXT_CHANGED', message: 'Your session changed in another tab. Reload this page.' });
    }

    req.user = user;
    req.authSession = session;
    // Throttle bookkeeping only; revocation and permissions are checked on every request.
    if (Date.now() - new Date(session.lastSeenAt).getTime() > 60000) {
      await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { lastSeenAt: new Date() } });
    }
    if (req.inspectionActor) return inspectionContext.run(true, next);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

// Role-based access control middleware
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};

export { JWT_SECRET };

// Also covers unauthenticated mutation routes (password reset/login) while inspecting.
export const inspectionReadOnlyGuard = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/api/auth/inspection/stop') return next();
  try {
    const token = getRequestToken(req);
    const decoded = token && jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    if (decoded?.inspection === true) return res.status(403).json({ message: 'Inspection mode is read-only. Return to Super Admin first.' });
  } catch { /* Normal authentication handles missing or invalid tokens. */ }
  next();
};

const SESSION_COOKIE_NAME = 'gtvets_session';
const CSRF_COOKIE_NAME = 'gtvets_csrf';

const parseCookies = (cookieHeader = '') => Object.fromEntries(
  cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) return [entry, ''];
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      try {
        return [key, decodeURIComponent(value)];
      } catch {
        return [key, value];
      }
    })
);

const appendResponseCookie = (res, value) => {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', value);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, value]);
    return;
  }
  res.setHeader('Set-Cookie', [current, value]);
};

const buildCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  parts.push(`Path=${options.path || '/'}`);
  return parts.join('; ');
};

const isSecureCookie = () => process.env.NODE_ENV === 'production';

const tokensMatch = (cookieToken, headerToken) => {
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  const cookieBuffer = Buffer.from(cookieToken, 'utf8');
  const headerBuffer = Buffer.from(headerToken, 'utf8');
  return cookieBuffer.length === headerBuffer.length
    && crypto.timingSafeEqual(cookieBuffer, headerBuffer);
};

export const issueCsrfToken = (res) => {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  appendResponseCookie(res, buildCookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }));
  return csrfToken;
};

export const setSessionCookies = (res, token) => {
  appendResponseCookie(res, buildCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }));
  issueCsrfToken(res);
};

export const clearSessionCookies = (res) => {
  appendResponseCookie(res, buildCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  }));
  appendResponseCookie(res, buildCookie(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  }));
};

export const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = req.headers['x-csrf-token'];

  if (!tokensMatch(csrfCookie, csrfHeader)) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
};

export const getRequestToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[SESSION_COOKIE_NAME] || null;
};
