# HQ system health

HQ users (SuperAdmin, HQManager and HQStaff) can open `/system-health` from System
Administration. The authenticated `GET /api/system-health` API enforces these roles
server-side and returns no-store responses. Institution, regional, guardian and
partner users cannot access the diagnostics.

Checks run independently with an eight-second response deadline per check.
Concurrent requests share work; results are cached for fifteen seconds per worker
to avoid repeated SMTP authentication and storage probes. The original timestamp
is retained. The page refreshes every minute and clearly marks offline, failed or
old results as last known. A report can be downloaded for deployment records.

| Check | Evidence | Limit |
| --- | --- | --- |
| API | Authenticated response and process uptime | This application instance |
| Database | Live MongoDB ping | Does not prove all queries are correct |
| Mongoose | Actual model read | Prisma is explicitly not used |
| Queue | Persistent notification counts and successful worker heartbeat | Five-minute freshness threshold; not a Redis queue |
| Storage | Temporary upload write/read/delete and filesystem space | No existing user files changed |
| Push | VAPID validation, subscription count and recent failures | No push sent; device delivery is not guaranteed |
| Email | Bounded SMTP connection/authentication verification | No email sent; inbox delivery is not tested |
| Backups | Existing read-only backup monitor status | Same freshness rules as `/backup-health` |
| App version | Package version, running Node.js version, recorded commit/build time | Missing metadata is reported as a warning |

Provider error messages, credentials, database addresses, hostnames, filesystem
paths and recipient details are never returned. Only approved failure codes are
logged/returned. No service restart, queue retry, or configuration mutation is
available from this page. SMTP probes use a separate transport with bounded DNS,
connection, greeting and idle timeouts. The response deadline bounds the UI wait;
an already-started driver operation can finish after that deadline.

On deployment, record `APP_COMMIT` (full forty-character Git SHA) and
`APP_BUILD_TIME` (ISO UTC time) as Compose build arguments. Docker embeds these
values in the image; missing values remain explicitly unknown. Rebuild the app
container to install the page and worker heartbeat instrumentation. The worker
records a successful heartbeat after its scheduled work and delivery pass finish;
errors record a failure timestamp. Existing schedule documents need no migration.
