import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'csrf-test-secret-that-is-long-enough-for-tests';

const { csrfProtection, issueCsrfToken } = await import('../middleware/auth.js');

const createResponse = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
};

test('production CSRF cookie is secure and uses SameSite=Lax', () => {
  const res = createResponse();
  const token = issueCsrfToken(res);
  const cookie = res.getHeader('set-cookie');

  assert.match(token, /^[a-f0-9]{48}$/);
  assert.match(cookie, /^gtvets_csrf=/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\//);
  assert.doesNotMatch(cookie, /HttpOnly/);
});

test('unsafe requests require matching CSRF cookie and header tokens', () => {
  const res = createResponse();
  const token = issueCsrfToken(res);
  const cookie = res.getHeader('set-cookie').split(';')[0];
  let nextCalled = false;

  csrfProtection({ method: 'POST', headers: { cookie, 'x-csrf-token': token } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('unsafe requests reject missing and mismatched CSRF tokens', () => {
  for (const headers of [
    {},
    { cookie: 'gtvets_csrf=correct', 'x-csrf-token': 'incorrect' },
  ]) {
    const res = createResponse();
    let nextCalled = false;

    csrfProtection({ method: 'DELETE', headers }, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { message: 'Invalid CSRF token' });
  }
});

test('safe requests do not require a CSRF token', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    let nextCalled = false;
    csrfProtection({ method, headers: {} }, createResponse(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  }
});
