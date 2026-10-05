# Account management safeguards

## Decision

User lifecycle changes and assignment mutations share a MongoDB lease stored in
`usermanagementlocks` under the fixed `_id` `lifecycle`. This supports the existing
standalone MongoDB deployment and coordinates multiple API processes without
adding a service or requiring replica-set transactions. A competing mutation
receives HTTP 409 and a retry message.
Authenticated mutation requests recheck their account and session after acquiring
the lease so an earlier authentication snapshot cannot outlive an access change.

The lease lasts two minutes and renews every 30 seconds. Account mutations check
the lease before their final write. It is released only after the handler finishes,
including work that continues after a client disconnect. A crashed process stops
renewing and the lease becomes available after expiry. A process stalled longer
than the lease is an operational failure requiring review; this is not a
replacement for transactional guarantees under arbitrary process pauses.

The lock spans user updates/deletion, access-request implementation, learner
ownership changes, placement activation/assignment, support ownership/status
changes, and workplace-transfer application. Lock order is account management
before the existing placement-operation lock. Read-only requests remain available.

We considered process-local locking, which cannot coordinate API workers, and
MongoDB transactions, which require a deployment change. Reconsider transactions
if strict cross-record atomicity becomes necessary or measured mutation contention
justifies changing the deployment. The global lease deliberately trades concurrent
assignment writes for a small, understandable coordination boundary.

## Account rules

- User-management responses allow only public account fields. Client input cannot
  change session epochs, reset tokens, or password-setup flags.
- Assigned learners, active owned/supervised/delegated placements, and open or
  in-progress assigned/escalated support tickets block deletion, suspension, and
  role/scope changes. Historical placement records retain their references.
- Administrators cannot remove their own access. At least one active SuperAdmin
  must remain.
- Password, status, role, scope, or linked-learner changes increment the account’s
  session epoch in the same save. Active sessions are also revoked. Reactivation
  cannot revive an earlier session even if the session cleanup fails.
- Password setup is enforced on the API. Session inspection and password change
  remain available; administrator inspection retains its existing read-only rules.
- Approved access requests must match a real account, the requested target, role,
  and applicable institution/region. Recovery additionally requires active status
  and completed password setup. Repeating the same implementation is idempotent.

## Recovery and deployment

No manual schema migration is required; the lock document is created on first use
and relies on MongoDB’s unique `_id` index. Deploy the backend and frontend together.
An administrator can review blockers, reassign work, release monitoring delegations,
and explicitly retry suspension or deletion. Delegation release keeps the placement
active and notifies its owner, the originating institution’s administrators and
managers, and the released officer.

If a mutation returns 409 because another update is running, allow that operation
to finish and retry. After an API crash, wait for lease expiry. Do not delete an
active lease to force a concurrent write. Account saves, session cleanup, audit
logging, and notifications span multiple writes; retry failed cleanup as needed.
Audit and notification delivery are not transactional with the account save.

## Verification

```sh
node --test server/tests/*.test.js
USER_MANAGEMENT_MONGO_INTEGRATION=1 node --test server/tests/userManagement.integration.test.js
cd client
PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/browser/user-management.spec.ts tests/browser/release-notes.spec.ts
npm run build
```

The MongoDB integration suite uses port 27032 and creates and drops only its own
`wel_user_management_qa_*` database. It verifies real persistence, lock contention,
session revocation, ownership blockers, approval implementation, password setup,
and read-only inspection. Browser tests use mocked APIs to verify user-facing flows.
