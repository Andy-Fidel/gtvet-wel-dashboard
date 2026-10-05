# Learner registry deletion

Institution Admins, Managers and Staff can select learners on the current registry
page and delete up to 100 IDs per request. Selection clears when the registry page
or filters change. The confirmation names the selected learners. Bulk deletion
requires connectivity and is excluded from the offline mutation queue.

`POST /api/learners/bulk-delete` accepts `{ "learnerIds": ["..."] }` and returns
`deletedCount`, `deletedIds`, and `skipped` items with reasons. IDs must be valid
and unique. Matching always uses the authenticated institution; unavailable and
out-of-scope IDs return the same explanation without disclosing learner details.
Deletion is idempotent in effect: repeating an already-deleted ID cannot remove
another record or generate a second deletion audit event.

Both bulk and individual deletion retain learners referenced by any placement
(including closed placements), transfer, request, monitoring visit, assessment,
evaluation, attendance record, consent, agreement, document, support ticket,
guardian link, report cohort, or report exception. Related records are never
cascaded away. Failed individual requests are shown as errors in the registry.

Deletion and HTTP paths that can introduce the first learner reference share the
existing account/assignment lease. Placement and support writes already use it;
monitoring creation, guardian account creation, placement-request creation,
document upload persistence and report cohort generation/refresh now use it too.
This prevents reference creation between the dependency check and deletion within
these application workflows. Existing lease expiry/process-pause limits are
documented in `user-management.md`. External database writes do not participate
in this coordination boundary.

Each successful deletion records an audit event with its previous learner data.
No schema migration is required. If a request fails partway through or the response
is lost, refresh the registry before retrying; already-deleted IDs are harmless.
Restoring a deleted, unreferenced learner requires an appropriate database backup.

Verification:

```sh
node --test server/tests/learnerBulkDelete.test.js
LEARNER_MONGO_INTEGRATION=1 node --test server/tests/learnerBulkDelete.integration.test.js
cd client
PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/browser/learner-bulk-delete.spec.ts
npm run build
```

The integration suite uses a disposable `wel_learner_bulk_delete_qa_*` database
on local MongoDB port 27032 and drops it after verification.
