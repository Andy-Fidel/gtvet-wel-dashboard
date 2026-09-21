# Accessible application alerts

Use `toast` from `@/lib/toast` for application messages. Error, success and warning
messages enter the shared application-root dialog queue. Messages remain visible
until explicitly acknowledged with Close, the X button or Escape. Outside clicks
do not dismiss the dialog. Information/progress messages continue to use Sonner.
Do not import the Sonner toast directly in pages or components.

The host uses Radix Dialog for layering, keyboard focus containment, background
interaction restrictions and accessible naming. Error messages use `alertdialog`;
success/warning messages use `dialog`. A separate overlay covers the viewport.
Long messages scroll between the fixed heading and close controls. Queued messages
appear one at a time; identical plain messages are deduplicated while pending.
Optional descriptions and action/cancel buttons are retained. Duration settings do
not auto-dismiss modal alerts. `onDismiss` runs only on acknowledgement, not when
clearing a session or programmatically dismissing alerts.

Focus is captured before asynchronous operations can disable their submit buttons.
Dismissal returns focus to the originating control, or to the source form's trigger
when the operation closed the form. An available page control is the final fallback.
Switching away from an authenticated user clears pending messages from that session.
Alerts are held in memory, never local storage.

The host sits outside routed pages, including login/password recovery. Password reset
navigation waits for acknowledgement. Learner imports summarize partial success in
one warning with instructions to review the row errors.

## Verification

```sh
# Once on a new development machine:
cd client
npx playwright install chromium
npm run test:alerts
```

Alternatively, use an installed Chrome browser:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:alerts --prefix client
```

The tests start/reuse a local Vite server on port 5176 and mock API responses.
They cover real public recovery forms, an existing Radix form, keyboard and pointer
dismissal, draft preservation, focus return, queue order/deduplication, 320px layout,
viewport centering and automated WCAG-tagged axe checks on the alerts.
Automated checks support accessibility review; they do not constitute a full
screen-reader or WCAG conformance certification.
