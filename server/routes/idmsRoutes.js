import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_IDMS_API_BASE = 'https://gtvet-idms-api-8466d2bbdaf1.herokuapp.com';
const IDMS_API_BASE = (process.env.IDMS_API_BASE || DEFAULT_IDMS_API_BASE).replace(/\/$/, '');
const IDMS_REQUEST_TIMEOUT_MS = Number(process.env.IDMS_REQUEST_TIMEOUT_MS || 15000);
const IDMS_ALLOWED_PATH_PREFIXES = (process.env.IDMS_ALLOWED_PATH_PREFIXES || '/')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const isAllowedPath = (pathname) => (
  IDMS_ALLOWED_PATH_PREFIXES.some((prefix) => {
    if (prefix === '/') return pathname.startsWith('/');
    const normalizedPrefix = prefix.replace(/\/$/, '');
    return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`);
  })
);

const buildTargetUrl = (path, query = '') => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  const target = new URL(`${IDMS_API_BASE}${safePath}`);
  if (query) {
    target.search = query.startsWith('?') ? query : `?${query}`;
  }
  return target;
};

const forwardIdmsRequest = async (req, res) => {
  const upstreamPath = req.params.path ? `/${req.params.path.join('/')}` : '/';

  if (!isAllowedPath(upstreamPath)) {
    return res.status(403).json({ message: 'IDMS path is not allowed' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IDMS_REQUEST_TIMEOUT_MS);

  try {
    const target = buildTargetUrl(upstreamPath, req.originalUrl.split('?')[1] || '');
    const headers = {
      accept: req.get('accept') || 'application/json',
    };

    if (req.get('content-type')) {
      headers['content-type'] = req.get('content-type');
    }

    if (process.env.IDMS_API_TOKEN) {
      headers.authorization = `Bearer ${process.env.IDMS_API_TOKEN}`;
    }

    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
    const payload = await response.text();

    res.status(response.status);
    res.setHeader('content-type', contentType);
    return res.send(payload);
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return res.status(isAbort ? 504 : 502).json({
      message: isAbort ? 'IDMS request timed out' : 'IDMS request failed',
    });
  } finally {
    clearTimeout(timeout);
  }
};

router.use(auth);

router.get('/status', requireRole('SuperAdmin', 'RegionalAdmin', 'Admin'), async (_req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IDMS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(IDMS_API_BASE, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);

    return res.status(response.ok ? 200 : 502).json({
      connected: response.ok,
      apiBase: IDMS_API_BASE,
      status: response.status,
      data,
    });
  } catch (error) {
    return res.status(error?.name === 'AbortError' ? 504 : 502).json({
      connected: false,
      apiBase: IDMS_API_BASE,
      message: error?.name === 'AbortError' ? 'IDMS request timed out' : 'IDMS request failed',
    });
  } finally {
    clearTimeout(timeout);
  }
});

router.all('/*path', requireRole('SuperAdmin', 'RegionalAdmin', 'Admin'), forwardIdmsRequest);

export default router;
