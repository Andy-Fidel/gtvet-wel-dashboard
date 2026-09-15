# Placement activation and lifecycle safeguards

## User workflow

- Staff, Managers and Admins may submit institution-scoped placement requests. Registered-partner submissions remain Submitted; submitting does not reserve capacity or activate learners.
- Institution Admins and Managers activate requests. Learner-found requests must pass verification and approval first. Staff cannot directly activate, reopen, complete or terminate placements.
- Direct custom activation, request conversion and reopening share readiness, academic-year, WEL timing, date, partner approval/visibility, capacity and duplicate checks.
- Only an institution Admin may explicitly override WEL timing. The override does not bypass learner readiness, inactive/graduated learner restrictions, duplicate placement prevention, closed academic years, or partner capacity.
- Slot counts come from unique selected learners; availability is checked against actual active placement records rather than a possibly stale counter.
- Completion and termination reconcile the learner's current placement reference and status and the affected partner's occupied slots. If another active placement exists, that reference is retained. Archiving a closed placement hides it from the standard list/export but retains linked attendance, visits and other history. Active placements cannot be archived.
- Year-end placement closure also uses the shared operation workflow. The other academic-year archival/progression steps are not made transactional by this change.

## Standalone MongoDB recovery

`placementcoordinators/global` serializes placement mutations under a renewable two-minute lease. A validated command with fixed placement IDs is journaled durably before any operational writes. Insertions use those fixed IDs; learner references and capacity are recomputed; request conversion is the final operational step. Completion is recorded in `placementoperations`.

If a write fails, the pending command remains. The next placement mutation replays it before accepting new work. The same direct activation payload or request conversion reuses its operation result. Record version fences prevent expired workers from overwriting newer workflow writes. A permanently invalid/missing dependency fails closed and requires administrator inspection; never delete a pending journal to bypass an unresolved partial operation.

Notification dispatch remains best-effort, separate from the recoverable operational data writes. A restart between commit and notification dispatch can still miss an alert; this release does not add an email outbox.

## Deployment prerequisites

1. Back up the production database and pause placement writes during index setup/deployment.
2. Run `node server/scripts/audit_placement_integrity.js` with the target `MONGODB_URI` supplied securely. This is read-only by default; its output contains record IDs, not credentials.
3. Review duplicates and discrepancies. Do not automatically delete, merge or relink historical records. If duplicates exist, obtain approval for a specific repair plan.
4. When no duplicate active placements exist, run the same script with `--create-index`. This creates `one_active_placement_per_learner`, a unique partial index for Active placements. It changes no operational records. Index creation itself fails if a concurrent duplicate appears.
5. Deploy the application. Activation deliberately returns 503 if the required index is missing. Placement schema automatic index creation is disabled so startup never attempts an unreviewed uniqueness migration.
6. Verify request submission, management activation, closure and portal reads. Resume writes.

Do not roll back to the old application while an operation is pending: old releases bypass recovery, capacity reconciliation and workflow version guards. Retain the journal and resolve the operation before considering rollback.

## Verification

- Default regression suite: `node --test server/tests/*.test.js`.
- Isolated integration: start a disposable MongoDB bound to localhost port 27030, then run `PLACEMENT_MONGO_INTEGRATION=1 node --test server/tests/placementWorkflow.integration.test.js`. Each run uses a new `placement_workflow_qa_<timestamp>` database, does not read production credentials, and leaves its data for inspection.
- Client: `npm run build`; targeted ESLint for placement pages.

Read-only production preflight on September 15, 2026: configured database `gtvet-wel` contained zero placement records. No duplicate active placements, partner-capacity discrepancies, learner-link discrepancies, or invalid placement dates were found by the checks run. No production records were changed and no index was installed during that preflight.
