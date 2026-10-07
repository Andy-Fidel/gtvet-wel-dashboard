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
retention separately. Suggested retention: hourly copies for 48 hours, daily for
30 days, weekly for 12 weeks. The script does not delete remote backups.

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

For the approved Backblaze bucket `GTVET-WEL`, use the `recovery/` prefix.
Install `configure-backblaze.py` as `/usr/local/sbin/gtvet-configure-backblaze`
(0750), then run it through an interactive SSH terminal with `sudo`. It prompts
for the application key without echoing input, saves `/etc/gtvet-wel/rclone.conf`
with mode 0600, and verifies read access without uploading any files. Never paste
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
