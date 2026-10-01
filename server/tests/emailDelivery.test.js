import test from 'node:test';
import assert from 'node:assert/strict';
import authRouter from '../routes/authRoutes.js';
import { User } from '../models/User.js';
import { isMailerConfigured, sendPasswordResetEmail } from '../utils/mailer.js';
import { issueSetupLink } from '../routes/api.js';

const forgotPassword = authRouter.stack.find((layer) => layer.route?.path === '/forgot-password').route.stack.at(-1).handle;

test('password reset mail rejects when delivery is unavailable', async () => {
  if (isMailerConfigured()) return;
  await assert.rejects(
    sendPasswordResetEmail('someone@example.org', 'https://example.org/reset'),
    { code: 'MAILER_NOT_CONFIGURED' },
  );
});

test('forgot password keeps a generic response when email delivery fails', async (t) => {
  if (isMailerConfigured()) return;
  const user = new User({ name: 'Test User', email: 'someone@example.org', password: 'secret-password' });
  t.mock.method(User, 'findOne', async () => user);
  t.mock.method(User.prototype, 'save', async function () { return this; });
  t.mock.method(console, 'error', () => {});
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };

  await forgotPassword({ body: { email: user.email } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'If that email exists, a link has been sent.');
  assert.ok(user.resetPasswordToken);
});

test('setup invitation records delivery result only after the mail handoff', async () => {
  const saves = [];
  const user = {
    email: 'someone@example.org',
    async save() { saves.push({ status: this.invitationDeliveryStatus, sentAt: this.invitationSentAt }); },
  };
  let resetUrl;
  await issueSetupLink(user, { sendEmail: async (_email, url) => {
    assert.equal(saves.length, 1);
    assert.equal(saves[0].sentAt, undefined);
    resetUrl = url;
  } });
  assert.match(resetUrl, /\/reset-password\/[a-f0-9]{40}$/);
  assert.equal(user.invitationDeliveryStatus, 'sent');
  assert.ok(user.invitationSentAt instanceof Date);
  assert.equal(saves.length, 2);

  await assert.rejects(issueSetupLink(user, { sendEmail: async () => { throw new Error('SMTP unavailable'); } }), /SMTP unavailable/);
  assert.equal(user.invitationDeliveryStatus, 'failed');
  assert.equal(saves.at(-1).status, 'failed');
});
