# Help and Support audit

Date: 2026-10-01. Reviewed commit: `12bb648`.

Implementation update: the access checks, routing, notifications, ownership validation, lifecycle rules, retry keys, draft scoping, learner names and queue controls described below have been addressed in the subsequent Help and Support change. The findings remain here as the review baseline. Database pagination remains an improvement to consider after measuring real ticket volume and query latency; the current page still computes some viewer-specific counters from scoped ticket metadata. Mobile and non-SuperAdmin browser sessions remain to be checked with appropriate test accounts.

## Scope and evidence

Reviewed the live SuperAdmin Help and Support page, queue, ticket cards and new-ticket dialog; traced the React UI, API handlers, ticket schema, notifications, attachment authorization, HQ permissions and draft storage. Other roles were assessed from source, not authenticated browser sessions. No production tickets were created, answered, assigned or changed. Findings below distinguish observed UI behavior from source-level defects; exploit attempts and load tests were not performed.

The live queue contained five open, unassigned tickets, with no replies shown. Three displayed SLA breaches. This is a snapshot, not a measure of long-term support performance.

## Findings

### 1. High — Linked records are not consistently authorized during ticket creation

`server/routes/api.js:3451–3485`: a supplied placement is checked for partner access only. An institution user or guardian can supply a placement outside their scope. Partner-supplied learners are exempted from the institution check, and the route does not verify that the learner belongs to the selected placement. Supplying only an unrelated placement also changes the ticket's institution. Consequences include forged cross-institution references and routing; populated placement information may be returned to the creator.

**Repair:** authorize each linked record against the actor's scope; derive the learner from the placement where supplied; reject inconsistent learner/placement combinations. Test guardian linkage, institution boundaries, partner supervisor ownership and scoped HQ access.

### 2. High — Assignment and escalation accept arbitrary target user IDs

`server/routes/api.js:3746–3755,3809–3824`: the mutation routes authorize the person changing the ticket but never validate the target user's existence, active status, support role or access to that ticket. The dropdown filtering at `1671` is not enforced by these endpoints. A target can receive a notification containing the subject while being unable to open the ticket.

**Repair:** share one server-side eligibility rule between the dropdown and mutations; validate escalation level, destination and required reason together. The target must retain access to the ticket after assignment.

### 3. High — Attachment authorization is broader than ticket authorization

`server/routes/uploads.js:61–71,404–412`: attachment upload permits any RegionalAdmin and any HQ role through its ticket helper, while the main ticket API applies region/institution scope. The upload query also omits `archivedAt`, allowing attachments to archived tickets even though the ticket endpoints prohibit updates.

**Repair:** reuse the ticket access policy in uploads and downloads; enforce archive state and consistent linked-record relationships. Verify region and scoped HQ boundaries at the full upload route, including its middleware.

### 4. High — Support drafts can carry across accounts on a shared browser

`client/src/pages/SupportCenter.tsx:129,222–247`; `client/src/lib/offlineDrafts.ts`; `client/src/context/AuthContext.tsx:398–435`: new-ticket drafts use the global localStorage key `draft:support:new-ticket`; reply keys use only ticket IDs. Logout clears legacy queue storage but not these drafts. A different account opening Support Center can inherit the previous person's unsent ticket text.

**Repair:** scope draft keys to authenticated user and institution, remove unscoped legacy drafts, and test switching accounts. Preserve offline convenience without exposing another user's text.

### 5. High — The next-action owner is calculated from role rather than conversation participants

`server/routes/api.js:903–907,3606,3682–3686`: every administrator reply sets `awaitingParty = Partner`, including replies to guardians and institution requesters. Manager/Staff replies set it to Support even when the person is the assigned responder. Reopening a non-partner ticket also sets Partner. The awaiting-response filter uses these values, so work falls into the wrong queue.

**Repair:** calculate the next action from requester identity and authorized support ownership. A support response normally awaits the requester; a requester follow-up awaits support. Reopening must deliberately return the ticket to support.

### 6. High — Requester replies do not notify the responsible support person

`server/routes/api.js:3622–3637`: reply notifications target only the requester when someone else responds. When the requester replies, the recipient list is empty. Neither assigned nor escalation owners are notified. Support Center also has no periodic refresh or manual refresh control.

**Repair:** notify the relevant owner/escalation owner on requester replies, with a defined fallback support queue when unassigned; deduplicate recipients and exclude the sender. Refresh the queue on focus or through a bounded polling policy.

### 7. Medium — Visible assignment controls can silently clear existing values

`client/src/pages/SupportCenter.tsx:486–514,1118–1200`: selects display persisted assignment and escalation values when no draft exists, but save handlers use only draft state. Clicking Assign without changing the displayed selection sends null and unassigns the ticket. Clicking Update Escalation without edits sends empty ownership, level None and an empty reason.

**Repair:** initialize drafts from the current ticket or submit the same resolved values rendered by the controls. Disable save when unchanged and show a distinct explicit removal action.

### 8. Medium — Ticket lifecycle and SLA state can contradict each other

`server/routes/api.js:934–944,3582–3611,3669–3687`: closed/resolved tickets still accept replies without reopening; the reply changes awaiting-party while status remains closed. First-response breach calculation ignores terminal status. Reopening retains the original deadlines. Any non-requester reply counts as a first response, regardless of whether that person is a support responder.

**Repair:** define allowed transitions and a reopen policy; make reply-on-closed behavior explicit; distinguish historic SLA breaches from active overdue work. Require a resolution summary and record who resolved/reopened the ticket. Decide whether SLA clocks use calendar or business hours and document that choice.

### 9. Medium — Assignable roles cannot complete the workflow

`server/routes/api.js:872–879,1671–1684`: institution administrators can choose Manager/Staff candidates, but those assignees cannot resolve or close another person's ticket. Regional administrators cannot choose SuperAdmin through the assignee picker despite the guide recommending escalation to HQ. `server/utils/hqAccess.js` blocks support mutations for HQManager/HQStaff, while Support Center renders submission/reply controls for them and falls back to Staff guides (`SupportCenter.tsx:21,216–219,352`).

**Repair:** explicitly define requester, responder, triage and escalation permissions, then render controls from the same capability model. Restrict candidate lists to eligible responders and provide legitimate HQ escalation destinations.

### 10. Medium — Creation has weak validation and duplicate-submission protection

`client/src/pages/SupportCenter.tsx:407–438,550–600`: submit has no pending state, required-field validation or persistent field labels. The empty form's Submit button is enabled in the live UI. The API relies on schema errors and converts them to generic HTTP 500 responses. It also uses `priority.toLowerCase()` after saving, although priority is optional with a schema default; omitting it can save a ticket and then report failure, inviting a duplicate retry (`server/routes/api.js:3501–3549`).

**Repair:** normalize and validate inputs before writes; return field-specific 400 errors; disable submission while pending; use normalized/saved priority in messages. Give retries a stable operation ID where offline replay or ambiguous network failure can duplicate a ticket.

### 11. Medium — Learner names are missing in ticket responses

`server/routes/api.js:3051–3060` and other support population calls select `name trackingId` on Learner, but `name` is a virtual derived from first/middle/last name. The paginated path additionally uses lean results. The underlying name fields are never selected, so `SupportCenter.tsx:1061–1064` cannot reliably display the learner name.

**Repair:** select stored name fields and serialize a display name explicitly; cover paginated lists, focused tickets and mutation responses.

### 12. Medium — The queue UI makes triage unnecessarily difficult

Live desktop observation and `client/src/pages/SupportCenter.tsx:212,608–1000,1025–1248`:

- HQ opens on the playbook, not the queue.
- At the observed 1680×856 viewport, the queue's first screen shows summary and guidance panels, with no ticket row visible.
- Every ticket renders its full description, uploads, ownership, escalation, status buttons and all replies. This makes comparing tickets difficult.
- Filters cover status and a few queue views only. There is no ticket search, priority, SLA, institution or category filter, despite instructions to work by urgency and SLA risk.
- No visible stable ticket reference is available to quote in a conversation.
- Subject/reply/escalation inputs rely on placeholders; selectors lack persistent labels. The FAQ accordion lacks `aria-expanded` and `aria-controls`.
- A failed fetch produces a toast, then can show the same empty state as a successful empty result.
- Creation refreshes the current list but does not switch to the ticket tab or focus the created ticket.

**Repair:** use a compact queue plus a ticket detail view; default responders to active work and requesters to their tickets. Keep guides available in a secondary tab. Add search, actionable filters, visible ticket references, labeled inputs, loading/error/retry states and clear submission confirmation. Validate keyboard access and small-screen layouts after implementation; mobile was not visually tested in this audit.

### 13. Medium — Pagination and counters need clearer semantics

`server/routes/api.js:3015–3054`: the server loads metadata and read-state arrays for every matching ticket, then filters and paginates in memory. Page size therefore does not bound that work. Unassigned, urgent and incident totals include terminal tickets, and the status filter changes what “Total Tickets” means. Read receipts save the ticket and therefore update `updatedAt`, which is the list's sort key (`3139–3140`). Reading a ticket can move it ahead of actual conversations.

**Repair:** use database filtering/pagination and matching aggregate counters, distinguish active workload from historical totals, and sort by meaningful activity rather than read receipts. This is an architectural improvement; no latency or load benefit was measured here.

## What already works

The feature has threaded replies, attachments, per-user read state, notification deep links, role-scoped listing, audit records for major ticket actions, a searchable walkthrough catalog and offline draft/queue integration. These are useful foundations. The main gap is that routing, ownership and permissions do not yet form one consistent workflow.

## Recommended workflow

1. Requester submits a validated issue with optional authorized learner/placement context and receives a ticket reference.
2. Institution, regional or HQ triage receives it according to a documented routing rule.
3. An eligible responder claims or is assigned ownership; status becomes In Progress.
4. A responder reply sets Awaiting Requester; a requester reply sets Awaiting Support and notifies the owner.
5. Escalation requires an eligible destination and reason, preserves the thread, and notifies the new responsible person.
6. Resolution requires a summary; the requester can confirm closure or explicitly reopen.
7. Archived tickets remain readable and immutable, including attachments.

## Repair order and verification

1. Close linked-record, assignment, attachment and draft-privacy gaps.
2. Fix reply routing, owner notifications, assignment form defaults and role capabilities.
3. Define lifecycle/SLA rules and validate create/retry behavior.
4. Redesign queue/detail navigation, accessibility and error states.
5. Move pagination/counters to database queries and measure with realistic ticket volumes.

No dedicated support-ticket workflow tests were found in `server/tests`. Add coverage for role/scope boundaries, requester-to-responder exchanges, no-op assignment saves, close/reopen behavior, duplicate retries, archived attachments and account-switched drafts. Browser verification should include Guardian, institution responder, partner supervisor and scoped HQ roles at desktop and mobile widths.
