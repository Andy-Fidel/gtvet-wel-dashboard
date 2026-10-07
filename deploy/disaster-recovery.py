#!/usr/bin/env python3
"""Encrypted recovery bundles; never restores over a running database."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import urllib.parse


def run(args, timeout=300):
    # Command failures may contain credentials or document details. Keep output private.
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed (exit {result.returncode}); inspect the protected service configuration')
    return result.stdout.decode().strip()


def write_json(path, value, mode=0o600):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(mode)
    temporary.replace(path)


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def start_app(compose):
    run(compose + ['start', 'app'], timeout=60)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        container = run(compose + ['ps', '-q', 'app'], timeout=15)
        if container and run(['docker', 'inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', container], timeout=15) == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Application did not become healthy after resumption')


def config(path):
    path = Path(path)
    if path.stat().st_mode & 0o077:
        raise ValueError('Recovery configuration must be accessible only to its owner (0600)')
    value = json.loads(path.read_text())
    for key in ['repository', 'backup_directory', 'secrets_directory', 'mongo_config', 'recipients_file', 'rclone_config', 'remote']:
        if not value.get(key):
            raise ValueError(f'Missing configuration: {key}')
    if ':' not in value['remote'] or value['remote'].startswith(('/', ':')):
        raise ValueError('Use a named external rclone remote, not a local directory')
    return value


def backup(cfg, allow_write_pause=False):
    if not allow_write_pause:
        raise ValueError('This standalone database requires an approved write pause; use --allow-write-pause')
    for tool in ['docker', 'mongodump', 'age', 'rclone', 'git']:
        if not shutil.which(tool):
            raise ValueError(f'Required tool unavailable: {tool}')
    for key in ['mongo_config', 'recipients_file', 'rclone_config']:
        if not Path(cfg[key]).is_file():
            raise ValueError(f'Required file unavailable: {key}')
    destination = Path(cfg['backup_directory'])
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination.chmod(0o700)
    compose = ['docker', 'compose', '--project-directory', str(Path(cfg['repository']) / 'deploy')]
    # Root reads the deployment owned by ubuntu; trust only this configured checkout.
    git = ['git', '--no-optional-locks', '-c', 'safe.directory=' + str(Path(cfg['repository']).resolve()), '-C', cfg['repository']]
    timestamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    started = time.time()
    with (destination / '.recovery.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='.recovery-', dir=destination) as temporary:
            stage = Path(temporary)
            commit = run(git + ['rev-parse', 'HEAD'])
            if run(git + ['status', '--porcelain']):
                raise ValueError('Deployment checkout must be clean before creating a recovery bundle')
            container = run(compose + ['ps', '-q', 'app'])
            if not container:
                raise ValueError('Application is not running; refusing to change its state')
            if run(['docker', 'inspect', '--format', '{{.State.Running}}', container]) != 'true':
                raise ValueError('Application is stopped; refusing to change its state')
            mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', container]))
            uploads = next((m['Source'] for m in mounts if m['Destination'] == '/app/server/local-uploads'), None)
            if not uploads or not Path(uploads).is_dir():
                raise ValueError('Persistent uploads directory not found')
            run(git + ['bundle', 'create', str(stage / 'source.bundle'), 'HEAD'])
            stopped = False
            pause_started = time.time()
            try:
                # Always attempt recovery, including if stop times out halfway through.
                stopped = True
                (destination / '.app-paused').write_text(commit + '\n')
                run(compose + ['stop', '-t', '30', 'app'], timeout=60)
                run(['mongodump', '--config=' + cfg['mongo_config'], '--db=gtvet-wel', '--archive=' + str(stage / 'database.archive.gz'), '--gzip'], timeout=120)
                with tarfile.open(stage / 'uploads.tar.gz', 'w:gz') as archive:
                    archive.add(uploads, arcname='local-uploads')
                with tarfile.open(stage / 'configuration.tar.gz', 'w:gz') as archive:
                    archive.add(cfg['secrets_directory'], arcname='gtvet-wel')
                if run(git + ['rev-parse', 'HEAD']) != commit:
                    raise ValueError('A deployment changed during backup; this bundle will not be published')
            finally:
                if stopped:
                    start_app(compose)
                    (destination / '.app-paused').unlink(missing_ok=True)
            pause_seconds = round(time.time() - pause_started, 2)
            files = ['database.archive.gz', 'uploads.tar.gz', 'configuration.tar.gz', 'source.bundle']
            write_json(stage / 'manifest.json', {
                'format': 1, 'created_at': timestamp, 'commit': commit,
                'write_pause_seconds': pause_seconds,
                'files': {name: sha256(stage / name) for name in files},
            })
            plaintext = stage / 'recovery.tar'
            with tarfile.open(plaintext, 'w') as archive:
                for name in files + ['manifest.json']:
                    archive.add(stage / name, arcname=name)
            encrypted = destination / f'recovery-{timestamp}.tar.age'
            pending = stage / encrypted.name
            run(['age', '-R', cfg['recipients_file'], '-o', str(pending), str(plaintext)])
            pending.replace(encrypted)
            # Remove plaintext before making any external network request.
            for name in files + ['manifest.json', 'recovery.tar']:
                (stage / name).unlink()
            shutil.copy2(encrypted, stage / encrypted.name)
            remote = cfg['remote'].rstrip('/')
            run(['rclone', '--config', cfg['rclone_config'], 'copyto', str(encrypted), remote + '/' + encrypted.name, '--immutable'], timeout=600)
            run(['rclone', '--config', cfg['rclone_config'], 'check', str(stage), remote, '--one-way', '--download'], timeout=600)
            write_json(destination / 'last-success.json', {
                'verified_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                'bundle': encrypted.name, 'sha256': sha256(encrypted), 'commit': commit,
                'write_pause_seconds': pause_seconds, 'total_seconds': round(time.time() - started, 2),
            })
            cutoff = time.time() - 14 * 86400
            for old in destination.glob('recovery-*.tar.age'):
                if old.stat().st_mtime < cutoff:
                    old.unlink()
            print(json.dumps({'event': 'recovery_backup_verified', 'bundle': encrypted.name, 'write_pause_seconds': pause_seconds}))


def verify_and_unpack(bundle, identity, output):
    output = Path(output)
    if output.exists():
        raise ValueError('Recovery output must be a new directory; existing files are never overwritten')
    output.mkdir(parents=True, mode=0o700)
    try:
        with tempfile.TemporaryDirectory(prefix='verify-', dir=output) as temporary:
            plaintext = Path(temporary) / 'recovery.tar'
            run(['age', '-d', '-i', identity, '-o', str(plaintext), bundle])
            expected = {'manifest.json', 'database.archive.gz', 'uploads.tar.gz', 'configuration.tar.gz', 'source.bundle'}
            with tarfile.open(plaintext) as archive:
                members = archive.getmembers()
                if len(members) != len(expected) or {m.name for m in members} != expected or any(not m.isfile() for m in members):
                    raise ValueError('Unexpected recovery archive contents')
                for member in members:
                    with archive.extractfile(member) as src, (output / member.name).open('wb') as dst:
                        shutil.copyfileobj(src, dst)
            manifest = json.loads((output / 'manifest.json').read_text())
            if manifest.get('format') != 1 or set(manifest.get('files', {})) != expected - {'manifest.json'}:
                raise ValueError('Unsupported or incomplete recovery manifest')
            for name, checksum in manifest['files'].items():
                if sha256(output / name) != checksum:
                    raise ValueError(f'Checksum mismatch: {name}')
        print(json.dumps({'event': 'recovery_bundle_verified', 'commit': manifest['commit']}))
    except Exception:
        shutil.rmtree(output)
        raise


def check(cfg):
    status = Path(cfg['backup_directory']) / 'last-success.json'
    value = json.loads(status.read_text())
    age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(value['verified_at'])).total_seconds()
    if age > 90 * 60 or age < 0:
        raise ValueError('No externally verified recovery backup within the last 90 minutes')
    print(json.dumps({'event': 'recovery_backup_recent', 'age_seconds': round(age)}))


def resume(cfg):
    marker = Path(cfg['backup_directory']) / '.app-paused'
    if marker.exists():
        with (marker.parent / '.recovery.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if marker.exists():
                start_app(['docker', 'compose', '--project-directory', str(Path(cfg['repository']) / 'deploy')])
                marker.unlink()
                print(json.dumps({'event': 'recovery_application_resumed'}))


def monitor(cfg):
    failures = []
    try:
        check(cfg)
    except Exception:
        failures.append('No recently verified external recovery backup')
    usage = shutil.disk_usage(cfg['backup_directory'])
    if usage.used / usage.total > 0.85:
        failures.append('Backup filesystem is over 85% full')
    try:
        # UptimeRobot checks public reachability; this host cannot reliably loop
        # through its public IP, so monitor the local application listener here.
        with urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=15) as response:
            if json.load(response).get('status') != 'ok':
                raise ValueError('Unhealthy application')
    except Exception:
        failures.append('Application health check failed')
    public_status = cfg.get('public_status_file')
    if public_status:
        path = Path(public_status)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        path.parent.chmod(0o755)
        write_json(path, {
            'healthy': not failures,
            'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        }, mode=0o644)
    if failures:
        print(json.dumps({'event': 'recovery_monitor_failed', 'failures': failures}), file=sys.stderr)
        webhook = cfg.get('alert_webhook')
        state = Path(cfg['backup_directory']) / '.last-alert.json'
        recent = json.loads(state.read_text()) if state.exists() else {}
        if webhook and (recent.get('failures') != failures or time.time() - recent.get('sent_at', 0) > 1800):
            if not webhook.startswith('https://'):
                raise ValueError('Alert destination must use HTTPS')
            request = urllib.request.Request(webhook, data=json.dumps({'text': 'GTVET recovery alert: ' + '; '.join(failures)}).encode(), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=15) as response:
                if not 200 <= response.status < 300:
                    raise ValueError('Alert delivery failed')
            write_json(state, {'sent_at': time.time(), 'failures': failures})
        raise ValueError('Recovery monitoring needs attention')
    (Path(cfg['backup_directory']) / '.last-alert.json').unlink(missing_ok=True)
    heartbeat = cfg.get('uptimerobot_heartbeat_url')
    if heartbeat:
        parsed = urllib.parse.urlsplit(heartbeat)
        if parsed.scheme != 'https' or parsed.hostname != 'heartbeat.uptimerobot.com' or parsed.username or parsed.password or parsed.port not in (None, 443) or parsed.path in ('', '/'):
            raise ValueError('Configure a valid HTTPS UptimeRobot heartbeat URL')
        # Ping only after all checks pass: stale backups and server outages must alert.
        try:
            with urllib.request.urlopen(heartbeat, timeout=15) as response:
                if not 200 <= response.status < 300:
                    raise ValueError('Unexpected heartbeat response')
        except Exception:
            raise ValueError('UptimeRobot heartbeat delivery failed') from None
        print(json.dumps({'event': 'recovery_heartbeat_sent'}))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['backup', 'check', 'unpack', 'resume', 'monitor'])
    parser.add_argument('--config', default='/etc/gtvet-wel/recovery.json')
    parser.add_argument('--allow-write-pause', action='store_true')
    parser.add_argument('--bundle')
    parser.add_argument('--identity')
    parser.add_argument('--output')
    args = parser.parse_args()
    def interrupted(*_):
        raise RuntimeError('Operation interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        if args.operation == 'unpack':
            if not all([args.bundle, args.identity, args.output]):
                raise ValueError('Unpack requires --bundle, --identity and --output')
            verify_and_unpack(args.bundle, args.identity, args.output)
        elif args.operation == 'backup':
            backup(config(args.config), args.allow_write_pause)
        elif args.operation == 'resume':
            resume(config(args.config))
        elif args.operation == 'monitor':
            monitor(config(args.config))
        else:
            check(config(args.config))
    except Exception as error:
        print(json.dumps({'event': 'recovery_operation_failed', 'reason': str(error)}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
