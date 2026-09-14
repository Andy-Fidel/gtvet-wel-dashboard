# Academic calendar and term governance

## HQ setup

1. In Settings → Academic Terms, enter the approved academic year and semester dates. Activate the initial current term; later switches must use semester rollover.
2. In Academic Calendar, choose the academic year and create WEL drafts. Existing windows are preserved. Dates are shifted from the historical 2025/2026 template, not approved automatically.
3. Review each draft's dates, duration, calendar type and year group. An active WEL window must fit its matching Settings term.
4. Institution calendars include Settings term boundaries and active HQ events, retaining calendar-type filtering for WEL windows. Draft windows are not published to institutions.

Only SuperAdmin can change national terms and calendar events. HQ Manager/Staff retain their existing read-only policy. Calendar and term mutations are audited. Current terms cannot be deleted or replaced through ordinary editing; referenced terms cannot be deleted, and closure reports lock the term's dates/year/type. Unused term deletion archives the record.

## Standalone MongoDB consistency

`academicstates/global.currentTerm` is the authoritative current-term reference. Rollover changes this pointer and records the outgoing term in `completedTerms` in one atomic document update. API responses derive `isCurrent` and status from this state. Legacy term flags are only used to initialize the singleton; ambiguous legacy current terms fail closed.

Academic edits use a 120-second database lease. Rollover additionally compares the current pointer and lease token and rechecks open reports. An interrupted initial activation can leave a saved Planned term, which HQ can activate on retry; it cannot clear the existing current term.

Do not roll back to an older application after using the new term workflow without reconciling legacy `AcademicTerm.isCurrent/status` fields from the singleton during a maintenance window. Old releases do not understand the authoritative pointer. Do not restore a whole production database over newer operational records merely to roll back this feature.

## Verification

- `node --test server/tests/*.test.js` runs the default regression suite.
- The standalone database test is opt-in: start a fresh disposable MongoDB on localhost port 27029, then run `ACADEMIC_MONGO_INTEGRATION=1 node --test server/tests/academicGovernance.integration.test.js`. It writes only to `academic_governance_qa`, requires an empty term collection, and leaves QA data for inspection. Never run it against production.
- `npm run build` checks TypeScript and generates the production client.

The September 14, 2026 production preflight found no existing terms or WEL windows. Approved dates must be configured by HQ; this deployment does not invent or publish them.
