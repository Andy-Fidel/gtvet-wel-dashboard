# Session lifetime and recovery

## Decision

Online sessions expire after 30 minutes without user interaction, or eight hours after sign-in, whichever comes first. A two-minute warning offers “Stay signed in” for inactivity. The eight-hour deadline always requires authentication again. Critical user-management mutations require a sign-in within the last 15 minutes. Password changes, MFA management, inspection, and session revocation retain their existing password/authenticator confirmation requirements.

The server checks these deadlines on every authenticated request. JWTs and session cookies last eight hours. Database TTL cleanup is housekeeping, not authorization. Legacy seven-day records are clamped to eight hours from creation; records without activity metadata use creation time for inactivity. Deployment can therefore expire existing sessions immediately. No database migration is required.

## Activity and concurrency

`GET /api/auth/session` reports the server deadlines without extending them. `POST /api/auth/session/activity` requires an authenticated session and CSRF protection and records explicit user activity. Background reads, notification polling, offline synchronization, and session-status polling never extend inactivity. Browser interaction heartbeats are bounded to approximately one per minute per active tab; this can make the idle deadline up to a minute earlier than the last interaction. Stale interactions are not replayed after a sleeping tab wakes.

Activity updates atomically require an unrevoked, unexpired record and use `$max` so concurrent requests cannot move activity backwards. They cannot revive expired sessions. Activity deadlines are shared across tabs, using local storage for prompt UI updates and the server for enforcement. Client clocks are calibrated against server timestamps. Client timers provide feedback, not authorization.

## Unsaved work and authentication

Expiry locks the existing page behind an opaque, non-dismissible authentication dialog. Authenticated requests and offline synchronization are blocked while locked. Sign-in uses the same account, including MFA when enabled, rotates the session, and restores the mounted page without navigation. Unsaved form values remain in memory; passwords entered to resume are not stored persistently. If access scope changes, the app clears cached data and reloads rather than exposing previous permissions' data.

Memory preservation requires keeping the tab open. Reloading, closing the tab, or explicitly signing out can discard forms without their own draft persistence. Existing account-scoped offline drafts and queued actions remain on disk for the same user's next sign-in. Offline session snapshots obey the same idle and absolute deadlines; going offline does not grant additional time. Inspection sessions retain their shorter deadline and offer return to Super Admin instead of authenticating as the inspected user.

## Failure behavior and alternatives

Network failures never extend a deadline. “Stay signed in” reports connection errors; the page locks at its last known deadline. A new sign-in requires the server. Explicit logout clears local access even when connectivity fails. Session-status failures are retried on the next periodic check or when the page becomes visible.

A redirect to login was rejected because it unmounts unsaved forms. Generic automatic form serialization was rejected because it risks persisting passwords and personal data. Token refresh infrastructure was unnecessary because existing server session records already support revocation and fixed deadlines.

Revisit these defaults if observed workflows need longer offline access, security requirements change, or measured heartbeat/database load warrants adjustments. Any longer offline editing mode needs a separate explicit policy; it must not extend online authorization.

## Verification

- `node --test server/tests/sessionPolicy.test.js server/tests/security.test.js server/tests/inspection.test.js server/tests/authRateLimit.test.js`
- With an isolated MongoDB at `127.0.0.1:27031`: `SESSION_MONGO_INTEGRATION=1 SECURITY_MONGO_INTEGRATION=1 node --test server/tests/sessionPolicy.integration.test.js server/tests/security.integration.test.js`
- From `client`: `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/session-timeout.spec.ts tests/browser/password-recovery.spec.ts`

Integration tests create uniquely named QA databases and delete only those databases afterward.
