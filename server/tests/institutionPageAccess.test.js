import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';

const authorizationFor = (path) => {
  const route = router.stack.find((layer) => layer.route?.path === path)?.route;
  assert.ok(route, `Expected ${path} to be registered`);
  return route.stack[0].handle;
};

const assertAccess = (authorize, role, expectedStatus) => {
  let status;
  let nextCalled = false;
  const response = {
    status(code) { status = code; return this; },
    json() { return this; },
  };
  authorize({ user: { role } }, response, () => { nextCalled = true; });
  assert.equal(status, expectedStatus);
  assert.equal(nextCalled, expectedStatus === undefined);
};

test('institution managers cannot call progress tracker or graduated archive endpoints', () => {
  for (const path of [
    '/learners/progress/bulk',
    '/learners/graduated/export',
    '/learners/graduated/annual-report',
  ]) {
    assertAccess(authorizationFor(path), 'Manager', 403);
  }
});

test('authorized roles retain access to institution reporting endpoints', () => {
  assertAccess(authorizationFor('/learners/progress/bulk'), 'Admin', undefined);
  assertAccess(authorizationFor('/learners/progress/bulk'), 'RegionalAdmin', undefined);
  assertAccess(authorizationFor('/learners/graduated/export'), 'Admin', undefined);
  assertAccess(authorizationFor('/learners/graduated/export'), 'Staff', undefined);
  assertAccess(authorizationFor('/learners/graduated/annual-report'), 'Admin', undefined);
  assertAccess(authorizationFor('/learners/graduated/annual-report'), 'Staff', undefined);
});
