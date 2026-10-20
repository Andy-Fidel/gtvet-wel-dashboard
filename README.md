# GTVET - WEL Dashboard

Full‑stack dashboard for GTVET — WEL project. Frontend is a TypeScript + React + Vite app located in `client/`. Backend is a Node.js Express server in `server/`.

Quick start

HQ roles are assigned by SuperAdmin through User Governance. Each account is assigned a National, Region, or Institution scope:

- **HQ Manager** (`HQManager`): scoped operational oversight, with approval and rejection of term reports and industry partner submissions.
- **HQ Staff** (`HQStaff`): read-only operational oversight.

SuperAdmin selects a National, Region, or Institution scope when creating either HQ role. The API applies that scope to institutions, learners, placements, reports, monitoring, assessments, documents, vacancies, partners, audit records, and approval decisions. Neither HQ role can administer users or system settings. Existing HQ accounts without an explicit scope retain national access for compatibility. Personal authentication and notification read state remain available.

Run permission regression checks with `node --test server/tests/hqAccess.test.js` and build the frontend with `npm run build`.

1. Install dependencies for client and server:

```bash
cd client && npm install
cd ../server && npm install
```

2. Run client (development):

```bash
cd client
npm run dev
```

3. Run server (development):

```bash
cd server
node index.js
```

Notes

- See `client/README.md` for client-specific details.
- Add a `.env` file at the repository root or in `server/` for any secrets; `.env` is ignored by Git.

Self-hosted deployment

The production application is deployed over SSH to the Docker Compose host. See [deploy/README.md](deploy/README.md) for the server layout, deployment, health check, and rollback steps.

Optional config vars are listed in `.env.example` for SMTP, Cloudinary, Twilio WhatsApp, Web Push, CORS, and rate-limit tuning.

PWA push notifications

Web Push is available once a VAPID key pair is configured. Generate a pair once (keep the private key secret):

```bash
cd server
npm run generate:vapid
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a contact value such as
`VAPID_SUBJECT=mailto:admin@example.com` in the server environment. After deployment,
users can enable push for each device from **Settings → Notifications**. Push requires
HTTPS in production (localhost is allowed during development).

Optional GTVET-IDMS integration vars:

```bash
IDMS_API_BASE=https://idms.gtvets.gov.gh/api/integration
IDMS_SYNC_ENABLED=false
IDMS_API_TOKEN=
IDMS_REQUEST_TIMEOUT_MS=15000
```

Set an institution's IDMS identifier and enable synchronization from the institution editor before changing `IDMS_SYNC_ENABLED` to `true`. Institution Admin and Manager users can check authenticated connectivity through `GET /api/idms/status?academicYear=YYYY/YYYY`, preview changes through `GET /api/idms/learner-sync/preview`, and apply a reviewed import through `POST /api/idms/learner-sync`. The service credential remains server-side and requires read-only access to IDMS `/learners` and `/statistics` endpoints.

IDMS access is restricted to the WEL server outbound IP `197.253.124.38`. A `403` can indicate an unapproved source IP or insufficient endpoint permissions; a `401` indicates an invalid or missing token. Store `IDMS_API_TOKEN` only in the protected server environment (`/etc/gtvet-wel/app.env`, mode `0600`, for the self-hosted deployment), then recreate the application container to load changes. Never include the token in source control or client configuration.

Learner synchronization calls `/learners` with the institution and academic-year filters and follows `next_since_id` while `has_more` is true. The adapter reads the `data` array with boolean `has_more` and the resolved programme name from `programme`. Use the internal `institution_id` from `/institutions`, not the CSSPS `code`. Confirm institution identity and learner changes in a one-institution preview before applying an import. Invalid or stalled pagination fails the preview instead of producing a partial import.

Contributing

Feel free to open issues or PRs. For local development follow the Quick start above.

License

Specify a license in the project root if desired.
