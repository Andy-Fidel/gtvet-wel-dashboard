# Security rollout: sessions and authenticator MFA

This release rejects legacy JWTs without a persisted session. Announce a required
sign-in after deployment. No production changes are performed by adding this file.

## Before deployment

- Back up MongoDB and retain the previous application image.
- Generate a dedicated random 32-byte key (64 hexadecimal characters) for
  `MFA_ENCRYPTION_KEY`. Provision it through the existing protected server
  environment file, never in Git or chat. Keep an encrypted off-server copy with
  the database recovery material. Do not rotate it without re-enrollment or a
  deliberate migration: existing authenticator secrets require this key.
- Without a valid key, enrollment is unavailable. Existing enabled accounts do
  not silently bypass MFA if configuration is lost.
- Ensure the server clock is synchronized. TOTP accepts a one-step clock window.
- Confirm session indexes, including the expiry TTL index, are installed.

## Acceptance checks

1. Sign in, inspect Settings > Security, and confirm the current session is marked.
2. Sign in on a second browser; revoke it and verify its next request returns 401.
3. Verify non-SuperAdmin accounts cannot list or revoke other users' sessions.
4. Enroll MFA with a current password and authenticator confirmation. Save all
   eight recovery codes in an approved password manager; they appear only once.
5. Check that password-only login fails, an authenticator code succeeds, and a
   used code cannot be replayed. After five failures, wait ten minutes.
6. Test a recovery code once and verify reuse fails. Disable/re-enroll with a
   remaining code if the authenticator is lost. Losing both requires a separately
   authorized, identity-verified operator recovery procedure; there is no silent
   administrative MFA bypass in this release.
7. Change a password or role/scope and verify existing sessions stop working.
8. Confirm the audit log records session revocations and MFA changes without secrets.

MFA enrollment is opt-in in this initial rollout, not a tenant-wide enforcement
policy. Enroll privileged administrators before considering mandatory enforcement.
Session revocation takes effect at the next authorization check; it cannot undo
requests already in progress. IP/device metadata is informational, not proof of
device identity. Expired session rows are removed by MongoDB TTL cleanup.

Do not roll back to the old stateless-authentication release without assessing
the security impact: it does not enforce MFA or persisted-session revocation.

## Remaining roadmap

Next: notification delivery oversight (Microsoft 365 setup remains paused), backup
monitoring/recovery assurance, then tracked Action Center interventions and data
reconciliation. These later phases are not included in this security release.
