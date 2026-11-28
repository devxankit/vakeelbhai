#!/usr/bin/env bash
# Vakeel Bhai: update the server to the latest code on the deploy branch.
#   cd /srv/vakeelbhai && bash deploy/deploy.sh
# Steps: git pull → backend dependencies → tests are NOT run here (run them before pushing)
#        → build the website → reload the API → health check. Stops at the first error.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/api/health}"
cd "$APP_DIR"

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

say "Checking the server"
[ -f backend/.env ] || { echo "backend/.env is missing (see deploy/README.md)"; exit 1; }
grep -q '^NODE_ENV=production' backend/.env || { echo "backend/.env must set NODE_ENV=production"; exit 1; }

PREV="$(git rev-parse --short HEAD)"
say "Pulling $BRANCH (now at $PREV)"
git fetch --quiet origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
NOW="$(git rev-parse --short HEAD)"

say "API dependencies"
(cd backend && npm ci --omit=dev --no-audit --no-fund)

say "Building the website and admin panel"
(cd frontend && npm ci --no-audit --no-fund && npm run build)

say "Reloading the API"
if pm2 describe vakeelbhai-api >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save >/dev/null

say "Health check"
for i in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" | grep -q '"db":"up"'; then
    echo "OK: $NOW is live (was $PREV)"
    exit 0
  fi
  sleep 2
done
echo "The API did not come up healthy. Logs: pm2 logs vakeelbhai-api --lines 80"
echo "To go back: git checkout $PREV && bash deploy/deploy.sh   (then fix forward)"
exit 1
