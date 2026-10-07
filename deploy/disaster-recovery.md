# Disaster recovery operations

## Status and activation requirements

The existing daily MongoDB dump remains operational. The recovery bundle tooling
is separate and must not be scheduled until external storage, alert ownership,
key custody and write pauses have been agreed and a restore drill has succeeded.
One hour of data loss and four hours to restore service are proposed targets, not
measured guarantees. Hourly backups include all bundle components because current
uploads are small; measure the pause and storage growth before approving this schedule.

## Storage and keys

Use organisation-owned storage outside this host. Configure a named rclone remote
with permissions to upload, list and read the designated backup prefix. It must
not have permission to delete backups, alter retention, or disable object locks.
An administrator must configure storage versioning/immutability and lifecycle
retention separately. The approved tiered policy keeps hourly copies for 14 days,
daily copies for 30 days, and monthly copies for 365 days. These are operational
retention choices, not a universal regulatory requirement. The script does not
delete remote backups; expiry is enforced by Backblaze lifecycle rules.

With `tiered_retention: true`, new bundles go to `recovery/hourly/`. The first
verified bundle of each UTC day/month is also copied to `recovery/daily/YYYY-MM-DD.tar.age`
and `recovery/monthly/YYYY-MM.tar.age`, respectively. Each copy is immutable and
read back for comparison. Root-only `retention-points.json` receipts prevent
duplicate copies; pending receipts preserve the source filename and checksum so
retries reuse the original ciphertext. Failed tier publication prevents advancing
the successful-backup timestamp. Local ciphertext is pruned only after success.

During migration, run `promote` to create and verify daily/monthly points from a
recently verified bundle, without pausing the application. Then run
`backblaze-lifecycle.py --apply`. The helper changes only lifecycle rules in
`GTVET-WEL`, retains unrelated rules, rejects conflicting overlapping prefixes,
and uses the bucket revision to reject concurrent changes. The previous bucket
settings are saved privately under the backup directory. Existing flat
`recovery/recovery-*` bundles receive the same expiry as hourly copies.

Each prefix is hidden at its retention age and permanently deleted after one more
day hidden, subject to the 14-day compliance lock. Backblaze processes lifecycle
rules daily, so actual removal can occur later. The policy does not override locks
or legal holds. At the measured 13.04 MB bundle size, steady-state storage is
estimated at roughly 5–6 GB including daily/monthly copies and deletion lag;
growth must still be monitored. Older expired recovery points cannot be restored.

Generate a dedicated age identity on an administrator's trusted machine:

```sh
age-keygen -o recovery-identity.txt
age-keygen -y recovery-identity.txt > recovery-recipients.txt
```

Keep the identity in organisation-approved secure storage, with a second custodian.
Only `recovery-recipients.txt` goes on production. Never put the private identity
in the repository, application environment, server configuration or backup bundle.
Lost private keys make encrypted copies unrecoverable. Rotate recipients by retaining
identities needed to open older backups.

Install `age` and `rclone` using the OS package manager. Copy `recovery.example.json`
to `/etc/gtvet-wel/recovery.json`, fill in the real remote, and set permissions to
0600. Store rclone credentials in `/etc/gtvet-wel/rclone.conf`, also 0600. Optional
`alert_webhook` is a chosen HTTPS endpoint accepting JSON with a `text` field.
No alert destination is supplied by default.

For UptimeRobot, create a Cron job / Heartbeat monitor and store its unique HTTPS
URL as `uptimerobot_heartbeat_url` in the protected recovery configuration. The
monitoring service sends a heartbeat only when the external backup is less than
90 minutes old, disk usage is below 85%, and the local application is healthy.
Use an expected heartbeat interval longer than the monitoring timer's five-minute
interval (for example, ten minutes), and attach the desired UptimeRobot alert
contacts. Missing heartbeats cover server outages as well as stale backups.
Heartbeat availability depends on the UptimeRobot account plan; do not enable
scheduled write pauses until the backup cadence and alert destination are agreed.
Install `configure-uptimerobot.py` as `/usr/local/sbin/gtvet-configure-uptimerobot`
(0750) and run it through an interactive SSH terminal with `sudo` to enter that
URL without exposing it in chat or shell history. Then run the recovery monitor
once and verify the UptimeRobot monitor receives a heartbeat before enabling
`gtvet-recovery-monitor.timer`.

### First production bundle verified, 7 October 2026

`recovery-20261007T140430998539Z.tar.age` was uploaded to Backblaze and read back
for comparison. Its encrypted size was 13,038,888 bytes; the application pause
was 8.61 seconds and the full operation took 46.23 seconds. The Mac recovery
identity decrypted it successfully. All manifest checksums passed, the MongoDB
gzip stream was read successfully, and the uploads/configuration archives were
checked without extracting their contents. Temporary decrypted data was removed.
This verifies decryption and archive integrity; it does not constitute a full
application restore drill. An isolated MongoDB restore was verified previously.

The private identity is on the operator's Mac at
`~/.local/share/gtvet-wel/recovery/recovery-identity.txt` (0600), alongside its
public recipient and the official age tools. Only the public recipient was
copied to production. The custodian must keep a second secure copy of the private
identity outside this Mac. The hourly schedule was subsequently approved and
enabled on 7 October 2026 at 15 minutes past every hour (Africa/Accra). The measured
pause is an observation, not a guarantee for future backups or larger datasets.

### Free UptimeRobot backup monitoring

Set `public_status_file` to `/var/lib/gtvet-wel-backup-health/status.json` and enable
`gtvet-recovery-monitor.timer`. Every five minutes the monitor publishes only a
health flag and check timestamp. The application mounts this dedicated directory
read-only and serves `/backup-health`: HTTP 200 when checks are healthy and fresh,
HTTP 503 otherwise. Missing, malformed, future-dated or more than twelve-minute-old
monitor results fail closed. No backup names, paths, credentials, or data are
included in the response; caching is disabled.

In UptimeRobot, create an HTTP monitor for
`https://wel.gtvets.gov.gh/backup-health`, check every five minutes, and attach the
operator's existing email/push alert contacts. Backup freshness has a ninety-minute
threshold; disk pressure and application health are checked as well. A stopped
monitor service makes this endpoint unhealthy when its status expires. The server
checks its local application listener; UptimeRobot checks public reachability,
avoiding reliance on the host being able to reach its own public IP. This uses
HTTP monitoring without a paid heartbeat monitor.

For the approved Backblaze bucket `GTVET-WEL`, use the `recovery/` prefix.
Install `configure-backblaze.py` as `/usr/local/sbin/gtvet-configure-backblaze`
(0750), then run it through an interactive SSH terminal with `sudo`. It prompts
for the Key ID and application key from the same key entry without echoing input,
verifies read access without uploading files, then saves `/etc/gtvet-wel/rclone.conf`
with mode 0600. Use `--replace` to correct an existing pair; failed verification
preserves the existing configuration. Never paste
the secret into chat or a shell command. The console-created Read and Write key
also permits deletion; use the approved 14-day bucket lock and, where practical,
replace it with a custom API key excluding deletion and retention-management
capabilities. The key expires after 90 days and must be renewed before expiry.

## Bundle creation

Install `disaster-recovery.py` as `/usr/local/sbin/gtvet-disaster-recovery` (0750).
It uses the currently running app's actual uploads mount, requires a clean Git
checkout, and includes source history, MongoDB, uploads and protected configuration.
The standalone database is backed up while the app is stopped. This assumes the
app is the only writer: stop other database-writing jobs/admin operations too.
Do not deploy concurrently with a backup; serialize deployments with the same
`/var/backups/gtvet-wel-recovery/.recovery.lock` using `flock`.

For an approved manual window:

```sh
sudo /usr/local/sbin/gtvet-disaster-recovery backup --allow-write-pause
sudo /usr/local/sbin/gtvet-disaster-recovery check
```

The app is resumed and awaited before encryption/upload. Temporary plaintext is
root-only and removed when the process exits normally or fails. A machine crash
may leave a root-only `.recovery-*` directory; after recovery, inspect and remove
such abandoned directories while holding the backup lock. Disk encryption remains
the host administrator's responsibility. The script retains encrypted local copies
for 14 days, pruning only after an externally verified successful backup.

Transfer uses `copyto --immutable`; read-back verification uses `check --download`.
Success is recorded only after both complete. A failed transfer retains the local
encrypted bundle and does not advance `last-success.json`. It will not satisfy the
external-backup freshness check. The script never overwrites an external bundle.

Install the recovery service/timer units from `systemd/`. Do not enable them until
the first encrypted external copy has been downloaded and restored successfully.
Enable the resume service for recovery after an interrupted backup/reboot. The
backup service also attempts resumption through `ExecStopPost` on failure.

The monitor checks external backup freshness (90-minute threshold), disk usage
(85%), and public health every five minutes. Without `alert_webhook`, failures
appear only in the system journal. A monitor running outside this server is also
required: a dead server cannot send its own outage alert. A health check failure
does not trigger an unlimited restart loop.

## Isolated restore drill

Download a selected encrypted bundle from the external destination to a trusted
isolated recovery machine. Record its checksum and download completion time.

```sh
python3 disaster-recovery.py unpack --bundle recovery.tar.age \
  --identity /secure/recovery-identity.txt --output /secure/recovery-drill
```

Unpack verifies the encrypted stream, strictly permits the five expected archive
files, and verifies their manifest hashes. It refuses an existing output directory.
This is archive validation, not proof of database or application recovery.

Run a disposable MongoDB matching the production major version on a loopback-only
port. Restore the whole dump under a disposable namespace, never production:

```sh
mongorestore --uri=mongodb://127.0.0.1:27032 \
  --archive=/secure/recovery-drill/database.archive.gz --gzip \
  --nsFrom='gtvet-wel.*' --nsTo='recovery_drill.*'
```

Check learners, placements, documents, users, audit trails, and OfflineAction receipts.
Restore uploads into a fresh isolated directory. Inspect inner tar entries for
unexpected paths/links before extraction; never extract over production. Recreate
the source checkout from `source.bundle`, checking out the manifest commit. Provide
an isolated environment pointing at the restored database and uploads. Disable
email, push and other external writes for the drill. Verify login, role isolation,
document downloads and core workflows. Record actual recovery time, record counts,
failures and the responsible operator; delete isolated personal data after testing.

## Real recovery

1. Declare the incident, keep evidence, and stop application writes/traffic.
2. Choose an externally verified bundle from before the incident. Record its age
   and the potential data loss. Use an isolated restore first if corruption is suspected.
3. Provision a replacement Ubuntu host with compatible Docker, MongoDB and tools.
   Recreate the private Docker bridge and MongoDB startup ordering from `README.md`.
4. Unpack and verify the bundle. Restore protected configuration with 0600
   permissions; inspect/update host-specific paths. MongoDB authentication users
   in `admin` are not included in the application database dump: recreate the
   required database users using the protected credentials, without printing them.
5. Restore all `gtvet-wel` collections together, including OfflineAction receipts.
   Restore uploads and their container ownership. Restore matching source revision;
   rebuild the app. Caddy can obtain new TLS certificates after DNS cutover.
6. Validate health, login, tenant/role access, learners, placements and documents.
   Check Offline Sync and do not discard receipt collections.
7. Switch DNS/traffic, observe errors, and verify a fresh external backup from the
   replacement host. Rotate credentials if the original machine was compromised.

An app rollback uses the retained Docker image; it is not a database rollback.
Never restore an old database merely to undo a frontend deployment. For accidental
deletion, restore an isolated copy first and recover reviewed records selectively.

## Validation before enabling

```sh
python3 -m unittest discover -s deploy/tests -v
systemd-analyze verify /etc/systemd/system/gtvet-recovery-*.service \
  /etc/systemd/system/gtvet-recovery-*.timer
```

Tests cover failure recovery, publication rules and manifest verification. A live
encrypted upload/download, MongoDB restore and application drill are still required
to demonstrate disaster recovery readiness.
