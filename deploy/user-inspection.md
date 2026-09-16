# Super Admin user inspection

In Users, open an active non-SuperAdmin account's Actions menu and select
**Inspect as user (read-only)**. Enter the Super Admin password and a reason.

- The session lasts at most 15 minutes and uses the target's existing RBAC/scope.
- The banner identifies the target and inspector and provides Return to Super Admin.
- A path-restricted, HttpOnly return cookie permits returning after expiry without
  extending the original administrator session. A revoked or changed parent
  account cannot be restored; the administrator must authenticate again.
- All browser tabs share the account switch. Tabs reload on the context-change
  signal; authenticated fetches also carry the expected user ID to reject stale tabs.
- Mutations are blocked server-side, including password-reset, upload, messaging,
  MFA and user-management routes. Offline queuing/sync is disabled for inspection.
- Automatic learner progression, generated notifications, message read receipts,
  and lazy settings/academic-state creation are suppressed during inspection.
- Real user sessions, passwords and last-login timestamps are not modified.
- Start/end events record the real Super Admin, target, reason and inspection ID.
  Session expiry is also recorded on the start event. Inspection initiation fails
  if the audit entry cannot be persisted.
- Target SuperAdmins, inactive accounts, and nested inspection are disallowed.

This feature depends on the persisted-session security release. It is not deployed
by these code changes. Add inspection-side-effect checks whenever introducing a
GET endpoint that initializes data, sends notifications, or marks content as read.

Verification: `SECURITY_MONGO_INTEGRATION=1 node --test server/tests/inspection.integration.test.js`
uses only disposable local databases on MongoDB port 27031, never production.
