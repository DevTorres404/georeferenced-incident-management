#!/usr/bin/env sh
set -eu

# Deploy script for the production Docker Compose stack.
# Run from the server after configuring backend/.env.

cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
ENV_FILE="${SGI_ENV_FILE:-.env}"

# ---------------------------------------------------------------------------
# Precondiciones: verificar variables criticas antes de continuar
# ---------------------------------------------------------------------------
echo "==> Validating environment"

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} no encontrado. Copia .env.example y completa las variables." >&2
  exit 1
fi

# Cargar variables del .env para validar (sin exportar al entorno actual)
APP_KEY_VAL=$(grep -E '^APP_KEY=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")
APP_DEBUG_VAL=$(grep -E '^APP_DEBUG=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]')
DB_PASSWORD_VAL=$(grep -E '^DB_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "${APP_KEY_VAL}" ]; then
  echo "ERROR: APP_KEY esta vacio. Genera uno con:" >&2
  echo "  docker compose -f ${COMPOSE_FILE} run --rm app php artisan key:generate --show" >&2
  exit 1
fi

if [ "${APP_DEBUG_VAL}" = "true" ]; then
  echo "ERROR: APP_DEBUG=true en produccion. Cambialo a false antes de desplegar." >&2
  exit 1
fi

if [ -z "${DB_PASSWORD_VAL}" ] || [ "${DB_PASSWORD_VAL}" = "change-me-db-password" ]; then
  echo "ERROR: DB_PASSWORD no esta configurado o usa el valor por defecto." >&2
  exit 1
fi

echo "    OK: APP_KEY, APP_DEBUG y DB_PASSWORD validados."

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
echo "==> Pulling latest code"
git pull --ff-only

echo "==> Pulling external images"
${COMPOSE} pull nginx pgsql redis || true

echo "==> Building backend image"
${COMPOSE} build app

echo "==> Starting containers"
${COMPOSE} up -d --remove-orphans

echo "==> Waiting for application to be healthy"
RETRIES=20
until ${COMPOSE} exec -T app php artisan --version > /dev/null 2>&1 || [ "${RETRIES}" -eq 0 ]; do
  echo "    Esperando a que PHP-FPM este listo... (${RETRIES} intentos restantes)"
  sleep 5
  RETRIES=$((RETRIES - 1))
done

if [ "${RETRIES}" -eq 0 ]; then
  echo "ERROR: La aplicacion no respondio a tiempo." >&2
  ${COMPOSE} logs app
  exit 1
fi

echo "==> Running database migrations"
${COMPOSE} exec -T app php artisan migrate --force

echo "==> Creating storage symlink if needed"
${COMPOSE} exec -T app php artisan storage:link || true

echo "==> Optimizing Laravel caches"
${COMPOSE} exec -T app php artisan optimize:clear
${COMPOSE} exec -T app php artisan config:cache
${COMPOSE} exec -T app php artisan route:cache
${COMPOSE} exec -T app php artisan view:cache
${COMPOSE} exec -T app php artisan event:cache

echo "==> Restarting queues"
${COMPOSE} exec -T app php artisan queue:restart

echo "==> Deployment finished"
${COMPOSE} ps