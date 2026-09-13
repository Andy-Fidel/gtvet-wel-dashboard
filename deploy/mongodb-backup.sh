#!/bin/sh
set -eu

umask 077

backup_dir="${MONGODB_BACKUP_DIR:-/var/backups/gtvet-wel}"
config_file="${MONGODB_BACKUP_CONFIG:-/etc/gtvet-wel/mongodump.yml}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_archive="${backup_dir}/.mongodb-${timestamp}.archive.gz.tmp"
final_archive="${backup_dir}/mongodb-${timestamp}.archive.gz"

mkdir -p "$backup_dir"
trap 'rm -f "$temporary_archive"' EXIT HUP INT TERM

mongodump \
  --config="$config_file" \
  --db=gtvet-wel \
  --archive="$temporary_archive" \
  --gzip

mv "$temporary_archive" "$final_archive"
find "$backup_dir" -type f -name 'mongodb-*.archive.gz' -mtime +13 -delete

