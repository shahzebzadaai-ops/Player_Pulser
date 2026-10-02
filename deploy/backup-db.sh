#!/usr/bin/env bash
# Timestamped PostgreSQL backup. The database URL is not printed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS="$ROOT/config/secrets.production.json"
OUT="${PP_BACKUP_DIR:-/var/backups/playerpulser}"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT/playerpulser-$STAMP.dump"
URL="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(!s.databaseUrl) process.exit(1); process.stdout.write(s.databaseUrl);" "$SECRETS")"
pg_dump --format=custom --no-password --file="$FILE" "$URL"
unset URL
echo "Wrote $FILE"
