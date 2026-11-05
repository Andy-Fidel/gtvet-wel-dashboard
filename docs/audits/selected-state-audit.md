# App-wide selected-state audit

Date: 5 November 2026. Baseline: `ca5d467`, with the existing uncommitted HQ Partner Registry tab fix present locally.

## Scope and evidence

Reviewed all 49 page TSX files and 81 component TSX files for shared tabs, pressed filters, conditional button variants, calendar selection, checkbox state, selected table rows and custom navigation. Browser-rendered 14 probes using the actual shared components and the class combinations found in those pages. Inspected computed selected/unselected styles and a desktop screenshot.

This was a repository-wide source audit with rendered component verification, not a signed-in walkthrough of every role, data combination or production page. The browser checks used the light theme. No application or database changes were made for this audit. The prior HQ registry tab fix remains separate and has not yet been deployed.

Evidence: `outputs/selected-state-audit/computed-states.json`, `shared-controls-desktop.png` and the saved diagnostic harness. The temporary audit entry point and browser test were removed from the application after capture.

## Root cause

`client/src/index.css:143–156` replaces HSL-channel tokens with complete `oklch(...)` color values. `client/tailwind.config.js:14–34` still wraps those values in `hsl(var(...))`. The resulting declarations, such as `hsl(oklch(...))`, are invalid. Browser computation confirms transparent active backgrounds and inherited text colors for controls using these tokens.

The effect is wider than tabs: `bg-primary`, `bg-background`, `bg-muted`, related foreground colors and focus-ring colors are affected. Explicit colors such as `bg-white`, `bg-indigo-50` and `bg-gray-950` continue to work. Some controls retain a shadow, outline, checkmark or border, so the finding is loss of the intended selected-state colors rather than complete absence of every visual cue.

## Confirmed affected areas

| Before | After | Why |
| --- | --- | --- |
| **Settings** (`Settings.tsx:501–519`): Security, Notifications, System and Academic Terms tabs inherit the broken active background/text tokens. Selected and inactive tabs have the same computed fill and text; a shadow remains. | Restore a reliable shared tab active fill/text treatment and visible keyboard focus. | Routine navigation relies on a subtle shadow. Role-gated tabs share the same trigger styling. |
| **Institution Industry Partners** (`IndustryPartners.tsx:191`): Browse partners versus My submissions & changes has the same token failure. | Apply the corrected shared tab treatment. | Users cannot reliably identify which directory view is open from color. |
| **Guardian Dashboard** (`GuardianDashboard.tsx:630–635,1033–1036`): Overview, History, Alerts and Support, plus Sign online versus Download & upload, lose active fill/text colors. | Apply a consistent selected state to both tab groups. | This affects navigation and the agreement-signing method. A shadow alone carries selection. |
| **Shared date pickers** (`ui/Calendar.tsx:198–203`): a selected date other than today has a transparent background; its normal-date neighbor is also transparent. The independent today highlight can be mistaken for the selection. | Restore explicit selected-date and range colors, distinct from today and focus. | Used by Attendance Log, Edit Placement, Monitoring Visit, Competency Assessment and Monthly Report forms. |
| **Learner Register selected rows** (`ui/table.tsx:61`, `ui/data-table.tsx:390`, `LearnerRegister.tsx:1141`): selected and unselected table rows have the same transparent background. | Restore persistent selected-row tint in addition to the checkbox. | Bulk-selected learners are harder to scan. The checkbox and selection count remain, so selection is not wholly hidden. |
| **Variant-only selection buttons**: What’s new audience (`WhatsNew.tsx:35–36`), Settings session scope (`SecuritySessions.tsx:77–78`) and Placements Missing workplace GPS (`Placements.tsx:781`) rely on default versus outline. The selected primary fill disappears. | Restore semantic button colors and provide explicit pressed-state styling for selectors. | The selected option can appear less emphasized than the outlined inactive option. |
| **HQ Partner Registry summary filters** (`HQIndustryPartners.tsx:241`): All partners, Pending HQ, Approved and Rejected set `aria-pressed` but always use the same classes. Computed fills, borders and text are identical. | Add a visible pressed-state fill/border/marker. | This is separate from the already-prepared section-tab fix. Fixing tokens alone will not fix it. |
| **Institution Partner Directory All regions** (`IndustryPartners.tsx:200`): `aria-pressed` changes without selected classes. Named regions have amber selected styling; All regions does not. | Give All regions the same selected treatment as the named region buttons. | Clearing the regional restriction has no corresponding selection cue. |

## Related weakened states

- Shared Checkbox (`ui/checkbox.tsx:18`) loses checked background/foreground colors. Its checkmark still renders, so it does not have a completely invisible checked state. Consumers include learner bulk selection, attendance sign-off, placement forms, guardian consent, institution/user forms and Settings.
- Help & Support tabs explicitly set active `bg-white`, so they retain a real selected surface. They still inherit broken token-based text and focus colors. This is lower priority than the missing-fill cases.
- Shared dropdown-menu focus/open styling also uses affected accent tokens (`ui/dropdown-menu.tsx:28,85,101,125`). This is a related keyboard/hover indication issue inferred from source, not separately exercised in the 14 probes. Selected-item checkmarks may remain.

## Controls with working local selection colors

The reviewed source/probes do not show the same selected-fill failure in Learner Profile tabs, Placements' All/Delegated/Batches tabs, HQ/Regional dashboard workspaces, monitoring/assessment workspace selectors, partner dashboard/history selectors, placement source/workplace choices, report year-group choices, learner export scope, calendar event-type chips, or HQ action queue categories. These use explicit colors or native form selection. The shared Select item already has explicit indigo focus styling.

These observations concern this selected-state issue; they are not a general accessibility certification of those pages.

## Repair sequence

1. Make theme tokens and Tailwind color mappings use one compatible representation. Validate both normal and hover/opacity utilities, including light/dark themes and focus rings.
2. Correct the shared Tabs, Button, Calendar, Checkbox and Table selected states, then verify their consumers and role-gated options.
3. Add explicit selected styling to the HQ summary filter cards and institution All regions button; these lack state rules independently of the token mismatch.
4. Keep working local indicators and the Partner & industry insights stat-card design intact. Test desktop, phone, keyboard focus, reduced motion and persisted/deep-linked selection.

No additional fixes or deployment were performed as part of this scan.
