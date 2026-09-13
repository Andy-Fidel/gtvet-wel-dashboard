# Self-hosted deployment

The application runs as an unprivileged Node.js container. Caddy is an optional
public profile that terminates HTTPS and proxies requests to the application.

## Server layout

- Repository: `/opt/gtvet-wel`
- Protected environment file: `/etc/gtvet-wel/app.env` (`0600`)
- Application listener: `127.0.0.1:5001`
- Public listeners after cutover: TCP 80/443 and UDP 443

## Stage privately

```bash
cd /opt/gtvet-wel/deploy
docker compose up -d --build app
curl --fail http://127.0.0.1:5001/health
```

## Enable HTTPS

Create a DNS A record pointing the production hostname to the server's public
IP. Set `FRONTEND_URL=https://hostname` and `CORS_ORIGINS=https://hostname` in
`/etc/gtvet-wel/app.env`, then run:

```bash
cd /opt/gtvet-wel/deploy
APP_DOMAIN=hostname docker compose --profile public up -d
```

Do not enable `NODE_ENV=production` over plain HTTP: authentication and CSRF
cookies are intentionally marked `Secure` in production.

## Update and rollback

Pull and rebuild only after recording the current commit. To roll back, check out
that commit and rebuild the app service. Keep the previous Render service live
until login, uploads, email, and core portal workflows pass on the new hostname.
