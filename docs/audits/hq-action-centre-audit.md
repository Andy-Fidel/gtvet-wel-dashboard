# HQ Action Centre audit

Date: 2026-11-05. Reviewed application commit: `c9f6b8730d031b6d2ed73dd18fc380e651e10626`.

## Scope and evidence

Reviewed the HQ dashboard, overview API, role guards, report/support destinations, return navigation, registry exports and report/deadline calculations. Used controlled local Chrome fixtures at 1440×1000 and 390×844, an axe accessibility scan of the action queue, and small source-derived calculation probes. These were fictional records, not authenticated production sessions. No production records, notifications or permissions were changed.

Five targeted browser probes reproduced the reported queue, navigation, role guidance, refresh and unsaved-form behavior. Separate source-derived probes reproduced deadline selection and CSV encoding.

The recommendations also apply the Emil design-engineering skill: prioritize frequent operational work, clear hierarchy, visible state, keyboard access, restrained motion and reduced-motion support.

## Before / after overview

| Before | After | Why |
| --- | --- | --- |
| Refresh unmounts the page and form | Refresh existing data in place | Preserve unsaved work and focus |
| Volume scores can outrank Critical severity | Sort by explicit severity, then deadline | Keep urgent work discoverable |
| One future cycle replaces outstanding deadlines | Track applicable overdue and upcoming cycles | Preserve unresolved obligations |
| Preview sizes appear as workload totals | Return full counts and paginated queues | Make totals and navigation trustworthy |
| Exception links open generic lists | Carry complete filters and return context | Let users act on the stated problem |
| All viewers get mutation instructions | Render capability-aware next steps | Match guidance to actual permissions |
| Large repeated cards precede workspace navigation | Move navigation up and compact the queue | Reduce scrolling on frequent workflows |
| Low-contrast labels and unconditional hover movement | Accessible secondary text and restrained pointer-only motion | Improve readability and keyboard/motion access |

## Findings

### 1. High — Critical work can be omitted or ranked below High work

`server/routes/api.js:12407`: the support preview selects six tickets by oldest `updatedAt` before the browser applies priority/SLA scoring. A newly urgent or overdue ticket can therefore be absent from the supposedly prioritized feed. `client/src/pages/SuperAdminDashboard.tsx:597–613` then mixes severity and affected-record volume into an unrestricted score: a High missing-supervisor group with 200 records receives score 278, above a Critical overdue support item at 120. The browser probe reproduced that order.

**Repair:** select and paginate the operational queue using a consistent server-side ordering. Order first by explicit severity, then applicable deadline/age, with a stable final tie-breaker. Treat affected-record volume separately. Provide counts over the complete authorized queue.

### 2. High — Deadline selection can hide overdue work and misapply calendar-specific deadlines

`server/routes/api.js:12522–12540`: the overview selects the earliest future deadline whenever one exists, and evaluates only that cycle. A source-derived probe with an outstanding October deadline and a December deadline selected December, preventing the overdue branch from evaluating October. The selection also ignores `institutionCalendarType`, although the calendar supports Single Track and Transitional deadlines. A deadline can be applied to institutions outside its calendar type.

**Repair:** retain outstanding overdue cycles independently of upcoming deadlines. Match applicable calendar type, cycle and year group per institution; return those identifiers with each action. Display the evaluated cycle explicitly.

### 3. High — Background refresh can destroy unsaved registry work

`client/src/pages/SuperAdminDashboard.tsx:268–299,437`: both manual and five-minute refreshes set the whole page to loading, replacing the existing page and dialog subtree with skeletons. `InstitutionForm.tsx:65` keeps its unsaved fields inside that subtree. A clock-controlled browser probe entered “Unsaved QA institution”, advanced five minutes, and observed an empty name field when the dialog returned. This also interrupts interaction and focus. A refresh error discards the previous usable snapshot (`setData(null)`), and overlapping responses have no cancellation or sequence guard.

**Repair:** separate initial loading from background refreshing, keep existing content/forms mounted, preserve the last successful snapshot on error, and abort or ignore stale requests. Refresh indicators should describe the state without taking over the workspace.

### 4. Medium — Workload counters describe samples and some queue tails are inaccessible

The overview caps reports and support at six records, deadline institutions at eight, and orphaned institutions/anomalies at eight (`api.js:12354,12412,12569,12587,12983`). The client labels the length of its combined preview array “Open actions” (`SuperAdminDashboard.tsx:744`). This mixes individual work items with aggregate exception groups and omits unsampled records. Critical/unassigned totals also cover the preview only.

`SuperAdminDashboard.tsx:615,818`: even after selecting a category, only ten items can be rendered, with no next-page/load-more action. A realistic fixture containing eight orphaned institutions plus four privilege anomalies exposed only ten of its twelve Governance actions.

**Repair:** distinguish full workload totals, affected-record totals and preview size; add pagination or a complete filtered destination for every category. Avoid “No open actions”/“up to date” claims based on a partial feed.

### 5. Medium — Actions lose the exception and return context

Deadline links include `deadlineView` and `semester`, but `SemesterReports.tsx:157–170` reads/forwards only status, institution and academic year. The browser probe observed `?institution=School+A&academicYear=2025%2F2026&page=1&pageSize=25`; the overdue and semester filters disappeared. Missing-report cases lead to an empty report list rather than a clear missing-submission workflow.

Data-quality actions (`SuperAdminDashboard.tsx:475–495,596`) open generic registers without the stated exception filters. “Return to Action Centre” always navigates to `/system-overview?view=operations` (`Layout.tsx:788`), losing the originating workspace and action category despite the banner promising preserved context.

**Repair:** implement matching destination filters and a useful missing-record state. Preserve a validated internal return URL containing workspace/category context, and restore position where practical.

### 6. Medium — Queue timing does not represent the actual next response

Report aging uses original report `createdAt`, not the time it entered HQ review (`api.js:12352–12358,13053`). A report drafted weeks ago but regionally approved today is immediately treated as a long-waiting HQ approval. Support actions use resolution due dates only (`SuperAdminDashboard.tsx:521–536`); the overview omits `awaitingParty`, `firstRespondedAt` and `lastActivityAt`. It cannot distinguish an overdue first response from a ticket awaiting its requester. Sorting by `updatedAt` also lets personal read-state saves affect the support preview order.

**Repair:** record/use explicit stage-entry timestamps for approval age. Reuse the Support Centre’s participant-based next action, first-response state and meaningful activity time. Keep request age, stage age and active SLA exposure separate.

### 7. Medium — Historical activity can conceal a missing visit on the current placement

`api.js:12483–12499` joins visits to active placements by learner alone. A visit from an earlier workplace satisfies the lookup, hiding an unmonitored current placement. The quality summary later also selects latest visits, assessments and evaluations by learner rather than placement (`api.js:12756–12853`). The missing-supervisor counter treats missing email as an exception even though operational placement forms support name/phone contact details.

**Repair:** associate placement-specific activity with the relevant placement and reporting period. Define required supervisor contact rules consistently with the forms and domain validation. Keep legacy activity visible with explicit provenance instead of crediting a different placement.

### 8. Medium — Read-only roles receive instructions they cannot perform

The action builder checks page access (`SuperAdminDashboard.tsx:612`), while next-action text still tells HQ Staff to “Review and approve or return”, and tells HQ Manager/HQ Staff to assign support owners or resolve/escalate tickets (`:516,534`). Browser probes reproduced those instructions for HQ Staff. The backend correctly restricts these mutations in `server/utils/hqAccess.js`; this finding concerns misleading workflow guidance, not a demonstrated authorization bypass. Generic labels such as “HQ Reporting Team” also resemble assigned owners without representing a persisted assignment.

**Repair:** distinguish review/oversight from mutation capabilities. Show the authorized next step and actual accountable role or named owner. Label queue responsibility separately from assignment.

### 9. Medium — Navigation is buried and queue text fails contrast checks

Workspace navigation follows the entire action queue (`SuperAdminDashboard.tsx:834`). With ten actions, the controlled fixture placed it at y=1953 on a 1000px-high desktop and y=4179 on an 844px-high phone. Users must pass the same large queue to reach Learner Oversight, Performance, Governance or Registries. The phone fit horizontally at 390px, but the action queue scan reported 42 text instances under one serious `color-contrast` violation. Low-contrast institution names, Responsible/Timing labels and Next action labels recur (`:796–810`). Row hover movement is unconditional (`:788`).

**Repair:** place workspace navigation near the page heading, use compact queue rows/cards and progressive disclosure, raise secondary-text contrast, gate pointer-only hover movement, and honor reduced motion. Keep frequent navigation and keyboard actions immediate.

### 10. Medium — Registry/performance CSV exports are unsafe and can be malformed

`SuperAdminDashboard.tsx:372–387` quotes a CSV field only when it contains a comma, leaving quotes and line breaks incorrectly encoded and formula prefixes unneutralized. Source-derived probes returned `=1+1` unchanged and failed to quote an embedded newline. Nested regional trend data becomes generic object strings. This export helper is separate from the safer learner/cohort exporters. No spreadsheet formulas were executed during the audit.

**Repair:** reuse a shared CSV encoder that consistently quotes/escapes fields, neutralizes formula prefixes, and explicitly maps human-readable export columns. Revoke the generated object URL after download.

## Additional observations

- Deadline notifications report the number of eligible admins rather than the result returned by `notifyUsers` (`api.js:13173–13192`). Deduplicated or preference-disabled sends can still be described as newly notified. Return created/skipped outcomes and validate the institution’s current deadline risk before sending a reminder.
- “Composite system health” is a manually weighted operational-risk score (`SuperAdminDashboard.tsx:618`), not infrastructure health, and uses some capped inputs. Label and explain it accordingly; keep the dedicated System Health diagnostics distinct.
- The overview computes analytics and loads all scoped learner histories even for the Operations view. This is a **likely optimization requiring measurement**, not a measured production bottleneck. Measure query count, payload size and latency before splitting queue and analytics loads. No production load test was performed.
- Existing portal-oversight tests cover navigation and learner panels but primarily use an empty action queue. Add populated-queue tests for full counts, severity order, pagination, role capability text, stage-entry age, multiple deadline cycles, historical placements, background refresh/form preservation and destination context.

## Suggested repair order

1. Stop refresh from discarding work; correct severity ordering and complete queue selection.
2. Correct deadline applicability, aging, support next-action state and current-placement activity attribution.
3. Repair destination/return context, full counts and queue navigation.
4. Align role guidance, improve contrast/density/motion, and consolidate safe exports.

The findings above describe the pre-fix baseline. No deployment was performed during the audit.

## Implementation follow-up — 5 November 2026

Implemented a complete, severity-first server action feed with category pagination and truthful full-queue counts. Deadline risks now retain older unresolved cycles and apply calendar/year-group rules. Report workflow writes record submission and HQ review entry; older reports use recorded approval history when available and otherwise show an unknown entry time. No dates were guessed or backfilled.

Support actions show ownership, awaiting state and the earliest response/resolution clock, with capability-aware instructions. Data-quality counters and destinations share scoped exception rules, credit monitoring/assessment activity to the current placement, and accept supervisor phone contact. Destination links retain deadline and exception context, and validated return links restore the originating queue page.

Background refresh preserves mounted forms and the last successful snapshot, cancels stale requests, and clears data when the viewer scope changes. Workspace navigation now precedes the queue. Queue styling improves contrast, focus visibility and reduced-motion behavior. Institution/regional exports use explicit readable columns and a shared CSV encoder. Operational risk is labeled separately from infrastructure health. Deadline reminders validate the current obligation and report actual created/skipped notifications with valid audit events.

Validation includes backend behavior tests, an isolated MongoDB workflow test, browser coverage for populated queues and destination filters, refresh interruption tests, mobile accessibility checks, and production compilation. The overview analytics architecture remains unchanged: splitting its reads is deferred until measurements justify that work. Production load and latency improvements are not claimed.


### Verification results

- 43 backend behavior checks passed, plus the isolated MongoDB workflow test.
- 20 HQ queue and release-history browser checks passed; the focused mobile layout check also passed after the final button fix.
- Earlier related regression coverage for portal oversight, support and monitoring PDF export passed (30 browser checks including the HQ suite).
- Targeted client ESLint, TypeScript compilation, production bundling, PWA generation and release-note validation passed.
- Automated queue accessibility scan reported no violations on the 390px phone fixture; desktop and phone screenshots were visually reviewed.

Changes are prepared locally. Deployment is a separate step.
