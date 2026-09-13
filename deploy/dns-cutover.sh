#!/bin/sh
set -eu

domain="${CUTOVER_DOMAIN:-wel.gtvets.gov.gh}"
target_ip="${CUTOVER_TARGET_IP:-197.253.124.38}"
state_dir="${CUTOVER_STATE_DIR:-/var/lib/gtvet-wel}"
backup_dir="${MONGODB_BACKUP_DIR:-/var/backups/gtvet-wel}"
source_config="${ATLAS_TOOLS_CONFIG:-/etc/gtvet-wel/atlas-tools.yml}"
target_config="${MONGODB_BACKUP_CONFIG:-/etc/gtvet-wel/mongodump.yml}"
compose_file="${COMPOSE_FILE:-/opt/gtvet-wel/deploy/docker-compose.yml}"
marker="${state_dir}/dns-cutover-complete"

mkdir -p "$state_dir" "$backup_dir"

if [ -f "$marker" ]; then
  exit 0
fi

if ! getent ahostsv4 "$domain" | awk '{print $1}' | grep -Fxq "$target_ip"; then
  echo "$domain does not resolve to $target_ip yet"
  exit 0
fi

exec 9>"${state_dir}/dns-cutover.lock"
flock -n 9 || exit 0

if [ -f "$marker" ]; then
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_archive="${backup_dir}/.atlas-final-${timestamp}.archive.gz.tmp"
final_archive="${backup_dir}/atlas-final-${timestamp}.archive.gz"
trap 'rm -f "$temporary_archive"' EXIT HUP INT TERM

mongodump \
  --config="$source_config" \
  --db=test \
  --archive="$temporary_archive" \
  --gzip
mv "$temporary_archive" "$final_archive"

docker compose -f "$compose_file" stop app
mongorestore \
  --config="$target_config" \
  --archive="$final_archive" \
  --gzip \
  --drop \
  --nsInclude='test.*' \
  --nsFrom='test.*' \
  --nsTo='gtvet-wel.*'

docker compose -f "$compose_file" start app

attempt=0
until curl --fail --silent http://127.0.0.1:5001/health >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Application failed its health check after the final restore" >&2
    exit 1
  fi
  sleep 2
done

APP_DOMAIN="$domain" docker compose -f "$compose_file" --profile public up -d caddy
/usr/local/sbin/gtvet-mongodb-backup

touch "$marker"
systemctl disable gtvet-dns-cutover.timer

echo "Cutover completed for $domain using $final_archive"

