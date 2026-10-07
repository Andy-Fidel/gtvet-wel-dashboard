#!/usr/bin/env python3
"""Enter a bucket-scoped B2 credential directly into protected server storage."""
import argparse
import getpass
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replace', action='store_true', help='Replace existing credentials only after verifying the new pair')
    args = parser.parse_args(argv)
    if os.geteuid() != 0 or not sys.stdin.isatty():
        print('Run as root from an interactive SSH terminal.', file=sys.stderr)
        return 1
    os.umask(0o077)
    destination = Path('/etc/gtvet-wel/rclone.conf')
    if destination.exists() and not args.replace:
        print('Configuration already exists; use --replace to verify and replace credentials.', file=sys.stderr)
        return 1
    print('Paste the new gtvet-server-backup key ID and secret from Backblaze. Input is hidden.')
    key_id = getpass.getpass('Key ID: ').strip()
    secret = getpass.getpass('Application key: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9]{10,100}', key_id) or not re.fullmatch(r'[A-Za-z0-9+/=_-]{16,200}', secret):
        print('Invalid key format; nothing was stored.', file=sys.stderr)
        return 1
    # Verify privately before publishing, so failed attempts preserve existing credentials.
    with tempfile.NamedTemporaryFile(mode='w', dir=destination.parent, prefix='.b2-setup-', delete=False) as output:
        temporary = output.name
        output.write('[organisation-backups]\ntype = b2\naccount = ' + key_id + '\nkey = ' + secret + '\n')
    try:
        result = subprocess.run([
            'rclone', '--config', temporary, 'lsf',
            'organisation-backups:GTVET-WEL/recovery/', '--max-depth', '1',
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if result.returncode:
            print('Connection verification failed; existing credentials are unchanged and backups remain inactive.', file=sys.stderr)
            return 1
        if args.replace:
            os.replace(temporary, destination)
        else:
            os.link(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Backblaze access verified. No backup data was uploaded and schedules remain inactive.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError, subprocess.TimeoutExpired):
        print('Setup interrupted or verification timed out; no backup schedule was activated.', file=sys.stderr)
        sys.exit(1)
