#!/usr/bin/env python3
"""Save a UptimeRobot heartbeat URL through a hidden interactive prompt."""
import getpass
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit


def save_url(destination, url):
    try:
        parsed = urlsplit(url)
        valid = parsed.scheme == 'https' and parsed.hostname == 'heartbeat.uptimerobot.com' and not parsed.username and not parsed.password and parsed.port in (None, 443) and parsed.path not in ('', '/')
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('Use the HTTPS heartbeat URL supplied by UptimeRobot')
    if destination.stat().st_mode & 0o077:
        raise ValueError('Recovery configuration must have permissions 0600')
    cfg = json.loads(destination.read_text())
    cfg['uptimerobot_heartbeat_url'] = url
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=destination.parent, prefix='.uptimerobot-', delete=False) as output:
            temporary = Path(output.name)
            json.dump(cfg, output, indent=2)
            output.write('\n')
        temporary.replace(destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        print('Run as root from an interactive SSH terminal.', file=sys.stderr)
        return 1
    os.umask(0o077)
    url = getpass.getpass('UptimeRobot heartbeat URL (hidden): ').strip()
    save_url(Path('/etc/gtvet-wel/recovery.json'), url)
    print('Heartbeat URL stored with mode 0600. Monitoring schedules are unchanged.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError, ValueError, OSError):
        print('Setup failed or was interrupted; no monitoring schedule was activated.', file=sys.stderr)
        sys.exit(1)
