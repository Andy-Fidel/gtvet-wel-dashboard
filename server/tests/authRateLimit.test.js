import test from 'node:test';
import assert from 'node:assert/strict';
import { authRateLimitKey, isSensitiveAuthRequest } from '../middleware/authRateLimit.js';

test('strict authentication limiting only selects sensitive mutations', () => {
  assert.equal(isSensitiveAuthRequest('GET', '/api/auth/csrf'), false);
  assert.equal(isSensitiveAuthRequest('GET', '/api/auth/me'), false);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/logout'), false);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/login'), true);
  assert.equal(isSensitiveAuthRequest('POST', '/API/AUTH/LOGIN/'), true);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/forgot-password'), true);
  assert.equal(isSensitiveAuthRequest('PUT', '/api/auth/reset-password/abc123'), true);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/security/mfa/enable'), true);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/security/sessions/abc/revoke'), true);
  assert.equal(isSensitiveAuthRequest('POST', '/api/auth/inspection/start'), true);
});

test('login limits isolate accounts sharing one network without leaking their email', () => {
  const request = (email) => ({
    ip: '192.0.2.50',
    body: { email },
    originalUrl: '/api/auth/login',
  });
  const firstKey = authRateLimitKey(request('first@example.test'));

  assert.equal(firstKey, authRateLimitKey(request(' FIRST@example.test ')));
  assert.notEqual(firstKey, authRateLimitKey(request('second@example.test')));
  assert.doesNotMatch(firstKey, /first@example\.test/);
});
