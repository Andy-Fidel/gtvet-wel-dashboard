#!/usr/bin/env python3
"""Inspect or apply prefix-scoped expiry for the GTVET recovery bucket."""
import argparse
import base64
import configparser
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.request

BUCKET_ID = 'e4c45d31d3bf1f55a512031e'
RETENTION = {'recovery/hourly/': 14, 'recovery/daily/': 30,
             'recovery/monthly/': 365, 'recovery/recovery-': 14}


def lifecycle_rules(existing):
    preserved = []
    for rule in existing:
        prefix = rule['fileNamePrefix']
        if prefix in RETENTION:
            continue
        if any(prefix.startswith(ours) or ours.startswith(prefix) for ours in RETENTION):
            raise ValueError('An existing lifecycle rule overlaps the recovery policy; review it before replacement')
        preserved.append(rule)
    return preserved + [{'fileNamePrefix': prefix, 'daysFromUploadingToHiding': days,
                         'daysFromHidingToDeleting': 1} for prefix, days in RETENTION.items()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the approved expiry policy after verifying daily/monthly copies')
    args = parser.parse_args()
    os.umask(0o077)
    p = configparser.ConfigParser()
    p.read('/etc/gtvet-wel/rclone.conf')
    key = p['organisation-backups']
    basic = base64.b64encode((key['account'] + ':' + key['key']).encode()).decode()
    request = urllib.request.Request('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', headers={'Authorization': 'Basic ' + basic})
    with urllib.request.urlopen(request, timeout=20) as response:
        auth = json.load(response)
    assert auth['allowed']['bucketId'] == BUCKET_ID
    assert auth['allowed']['namePrefix'] == 'recovery/'

    def api(operation, body):
        request = urllib.request.Request(auth['apiUrl'] + '/b2api/v2/' + operation, data=json.dumps(body).encode(), headers={'Authorization': auth['authorizationToken'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    bucket = api('b2_list_buckets', {'accountId': auth['accountId'], 'bucketId': BUCKET_ID})['buckets'][0]
    assert bucket['bucketName'] == 'GTVET-WEL' and bucket['bucketType'] == 'allPrivate'
    lock = bucket['fileLockConfiguration']['value']
    assert lock['isFileLockEnabled'] and lock['defaultRetention'] == {'mode': 'compliance', 'period': {'duration': 14, 'unit': 'days'}}
    rules = lifecycle_rules(bucket['lifecycleRules'])
    if args.apply:
        cfg = json.loads(Path('/etc/gtvet-wel/recovery.json').read_text())
        assert cfg.get('tiered_retention') is True
        state = json.loads((Path(cfg['backup_directory']) / 'retention-points.json').read_text())
        assert all(state.get(tier, {}).get('verified') is True for tier in ('daily', 'monthly'))
        today = dt.datetime.now(dt.timezone.utc)
        assert state['daily']['period'] == today.strftime('%Y-%m-%d')
        assert state['monthly']['period'] == today.strftime('%Y-%m')
        # Save the pre-change state privately for audit/recovery. Update only
        # lifecycle rules, using the revision to reject concurrent bucket changes.
        directory = Path(cfg['backup_directory'])
        before = directory / ('backblaze-lifecycle-before-' + str(bucket['revision']) + '.json')
        if not before.exists():
            with before.open('x') as output:
                json.dump(bucket, output, indent=2)
        api('b2_update_bucket', {'accountId': auth['accountId'], 'bucketId': BUCKET_ID, 'ifRevisionIs': bucket['revision'], 'lifecycleRules': rules})
        updated = api('b2_list_buckets', {'accountId': auth['accountId'], 'bucketId': BUCKET_ID})['buckets'][0]
        for field in ('bucketType', 'fileLockConfiguration', 'defaultServerSideEncryption', 'corsRules', 'bucketInfo'):
            assert updated.get(field) == bucket.get(field), 'Unexpected unrelated bucket change'
        # Backblaze may add optional lifecycle properties to the response.
        actual = {r['fileNamePrefix']: r for r in updated['lifecycleRules']}
        for rule in rules:
            assert all(actual[rule['fileNamePrefix']].get(k) == v for k, v in rule.items())
    print(json.dumps({'event': 'backblaze_lifecycle_applied' if args.apply else 'backblaze_lifecycle_plan', 'rules': rules, 'compliance_lock_days': 14}))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Backblaze lifecycle setup or verification failed; inspect protected configuration and re-read bucket settings.', file=sys.stderr)
        sys.exit(1)
