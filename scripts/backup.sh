#!/usr/bin/env bash
# Back up the production SQLite database. Runs ON THE SERVER, nightly from
# /etc/cron.d/mission-employed-backup (see DEPLOYMENT.md), or by hand:
#
#   ssh vps /home/ubuntu/traefik-projects/Mission-Employed/scripts/backup.sh
#
# The database lives on the laravel_data volume. The host has no sqlite3, so
# the copy is made inside the running laravel container with VACUUM INTO,
# which writes a consistent snapshot even while the app is writing. Copying
# the file with cp could catch it mid-transaction.
#
# Backups sit on the same disk as the volume: they cover a bad migration, a
# deleted row or a `docker compose down -v`, not the loss of the server.
set -euo pipefail

CONTAINER=mission_employed_laravel
VOLUME=mission-employed_laravel_data
DEST=/root/backups/mission-employed/db
KEEP_DAYS=30
SNAPSHOT=backup-in-progress.sqlite

log() {
  printf '[backup %s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

volume_dir=$(docker volume inspect "$VOLUME" --format '{{ .Mountpoint }}')
install -d -m 700 "$DEST"

# VACUUM INTO refuses to overwrite, so clear a leftover from a failed run.
rm -f "$volume_dir/$SNAPSHOT"

docker exec "$CONTAINER" php -r '
  $db = new PDO("sqlite:/data/database.sqlite", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  $db->exec("VACUUM INTO '\''/data/'"$SNAPSHOT"''\''");
'

target="$DEST/database-$(date -u +%Y%m%d-%H%M%S).sqlite.gz"
gzip -c "$volume_dir/$SNAPSHOT" > "$target.partial"
rm -f "$volume_dir/$SNAPSHOT"
mv "$target.partial" "$target"
chmod 600 "$target"

find "$DEST" -name 'database-*.sqlite.gz' -mtime +"$KEEP_DAYS" -delete

log "wrote $target ($(du -h "$target" | cut -f1)); $(find "$DEST" -name 'database-*.sqlite.gz' | wc -l) kept"
