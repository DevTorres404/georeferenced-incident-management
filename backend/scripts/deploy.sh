#!/usr/bin/env sh
set -eu

# Deploy script for the production Docker Compose stack.
# Run from the server after configuring backend/.env.

cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building and starting containers"
${COMPOSE} up -d --build --remove-orphans

echo "==> Waiting for application container"
${COMPOSE} exec -T app php artisan --version

echo "==> Running database migrations"
${COMPOSE} exec -T app php artisan migrate --force

echo "==> Creating storage symlink if needed"
${COMPOSE} exec -T app php artisan storage:link || true

echo "==> Optimizing Laravel caches"
${COMPOSE} exec -T app php artisan config:cache
${COMPOSE} exec -T app php artisan route:cache
${COMPOSE} exec -T app php artisan view:cache
${COMPOSE} exec -T app php artisan event:cache

echo "==> Restarting queues"
${COMPOSE} exec -T app php artisan queue:restart

echo "==> Deployment finished"
${COMPOSE} ps
