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
docker network create --driver bridge \
  --subnet 172.29.0.0/24 --gateway 172.29.0.1 gtvet-wel-web
cd /opt/gtvet-wel/deploy
docker compose up -d --build app
curl --fail http://127.0.0.1:5001/health
```

The fixed bridge lets the application reach a host-installed MongoDB bound to
`172.29.0.1` without exposing MongoDB on a public interface. Create it only once.
Install `systemd/mongod.service.d/gtvet-wel.conf` under
`/etc/systemd/system/mongod.service.d/` so MongoDB starts after Docker has
restored the bridge during boot.

## Database backups

Install `mongodb-backup.sh` as `/usr/local/sbin/gtvet-mongodb-backup` and the two
units in `systemd/` under `/etc/systemd/system/`. The timer creates a compressed
archive every day and retains 14 days. The root-only
`/etc/gtvet-wel/mongodump.yml` file must contain the authenticated local MongoDB
URI. Copy these archives off-server as well; local retention alone does not
protect against loss of the host or disk.

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
