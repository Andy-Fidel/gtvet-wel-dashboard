#!/usr/bin/env python3
"""Enter a bucket-scoped B2 credential directly into protected server storage."""
import getpass
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        print('Run as root from an interactive SSH terminal.', file=sys.stderr)
        return 1
    os.umask(0o077)
    destination = Path('/etc/gtvet-wel/rclone.conf')
    if destination.exists():
        print('Configuration already exists; refusing to replace credentials.', file=sys.stderr)
        return 1
    print('Paste the new gtvet-server-backup key ID and secret from Backblaze. Input is hidden.')
    key_id = getpass.getpass('Key ID: ').strip()
    secret = getpass.getpass('Application key: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9]{10,100}', key_id) or not re.fullmatch(r'[A-Za-z0-9+/=_-]{16,200}', secret):
        print('Invalid key format; nothing was stored.', file=sys.stderr)
        return 1
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write('[organisation-backups]\ntype = b2\naccount = ' + key_id + '\nkey = ' + secret + '\n')
    result = subprocess.run([
        'rclone', '--config', str(destination), 'lsf',
        'organisation-backups:GTVET-WEL/recovery/', '--max-depth', '1',
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    if result.returncode:
        print('Credential stored with mode 0600. Connection verification failed; backups remain inactive.', file=sys.stderr)
        return 1
    print('Backblaze access verified. No backup data was uploaded and schedules remain inactive.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError, subprocess.TimeoutExpired):
        print('Setup interrupted or verification timed out; no backup schedule was activated.', file=sys.stderr)
        sys.exit(1)
