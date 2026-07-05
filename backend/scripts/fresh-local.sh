#!/usr/bin/env sh
set -eu

# Reset helper for the local infrastructure compose file.
# This is destructive only when --yes is passed because it removes Docker volumes.

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  echo "This will stop local containers and delete local Docker volumes."
  echo "Run: sh scripts/fresh-local.sh --yes"
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker.compose.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"

echo "==> Stopping local stack and removing volumes"
${COMPOSE} down -v --remove-orphans

echo "==> Starting local infrastructure"
${COMPOSE} up -d --build

echo "==> Running local migrations and seeders"
php artisan migrate:fresh --seed

echo "==> Clearing local Laravel caches"
php artisan optimize:clear

echo "==> Local reset finished"
