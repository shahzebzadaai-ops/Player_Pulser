#!/usr/bin/env bash
# Update the app. Does not restart PostgreSQL.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci --include=dev
npx prisma generate
npx prisma migrate deploy
npm run build

if pm2 describe playerpulser-web >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --update-env
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save
echo "Web and worker reloaded. PostgreSQL was not restarted."
