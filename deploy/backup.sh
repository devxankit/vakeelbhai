#!/usr/bin/env bash
# Vakeel Bhai: nightly backup of the database and the uploaded files.
#   crontab -e  →  30 2 * * * bash /srv/vakeelbhai/deploy/backup.sh >> /var/log/vakeelbhai/backup.log 2>&1
#
# The uploaded files (advocate documents, chat photos) are ENCRYPTED with FILES_ENC_KEY from
# backend/.env. A backup is useless without that key: keep a copy of the key somewhere safe
# and separate from these backups (a password manager), never next to them.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BACKUP_DIR:-/var/backups/vakeelbhai}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"
chmod 700 "$DEST"

URI="$(grep '^MONGODB_URI=' "$APP_DIR/backend/.env" | cut -d= -f2-)"
UPLOADS="$(grep '^UPLOAD_DIR=' "$APP_DIR/backend/.env" | cut -d= -f2- || true)"
UPLOADS="${UPLOADS:-uploads}"
case "$UPLOADS" in /*) ;; *) UPLOADS="$APP_DIR/backend/$UPLOADS" ;; esac

mongodump --uri="$URI" --gzip --archive="$DEST/db_$STAMP.archive.gz" --quiet
tar -czf "$DEST/uploads_$STAMP.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"

find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: db_$STAMP.archive.gz uploads_$STAMP.tar.gz"
# Copy $DEST off the server too (another region or provider): a backup on the same disk
# does not survive losing the server.
