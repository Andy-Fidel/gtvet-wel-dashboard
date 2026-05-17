import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  const message = 'JWT_SECRET is not configured. Using an ephemeral in-memory secret; all tokens will be invalid after restart.';
  if (process.env.NODE_ENV === 'production') {
    console.error(`CRITICAL ERROR: ${message}`);
    process.exit(1);
  }
  console.warn(`Security warning: ${message}`);
}

const authCache = new LRUCache({ max: 500, ttl: 1000 * 30 }); // 30 second TTL

// Verify JWT token and attach user to request
export const auth = async (req, res, next) => {
  try {
    const token = getRequestToken(req);
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    
    let user = authCache.get(userId);
    if (!user) {
      user = await User.findById(userId)
        .populate('partnerId')
        .populate('linkedLearners', 'name trackingId institution');
        
      if (user) {
        authCache.set(userId, user);
      }
    }
    
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ message: 'Invalid token or inactive user' });
    }

    req.user = user;
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

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
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
