# Georeferenced Incident Management - Backend

Guia rapida para levantar el backend en local usando Docker solo para servicios de infraestructura y PHP/Composer instalados en la maquina.

## Requisitos

- Docker Desktop o Docker Engine con Docker Compose v2.
- PHP 8.3 o superior instalado localmente.
- Composer instalado localmente.
- Extensiones PHP recomendadas:
  - `pdo_pgsql`
  - `pgsql`
  - `mbstring`
  - `openssl`
  - `tokenizer`
  - `xml`
  - `ctype`
  - `fileinfo`
  - `curl`
  - `zip`

Verificar instalaciones:

```bash
php -v
composer -V
docker --version
docker compose version
```

## Servicios Docker

El archivo [docker.compose.yml](docker.compose.yml) levanta:

- PostgreSQL + PostGIS en `localhost:5432`
- Redis en `localhost:6379`
- Mailpit en `localhost:1025` y panel web en `http://localhost:8025`

## Configuracion inicial

Desde la carpeta `backend`:

```bash
cp .env.example .env
composer install
php artisan key:generate
```

En Windows PowerShell, si `cp` no esta disponible:

```powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
```

Edita `.env` y deja estos valores para desarrollo local:

```env
APP_NAME="Incident Management"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://127.0.0.1:8000

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=incident_management
DB_USERNAME=sail
DB_PASSWORD=secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_CLIENT=predis

CACHE_STORE=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file

MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_FROM_ADDRESS=no-reply@incidents.local
MAIL_FROM_NAME="${APP_NAME}"
```

Importante: `docker.compose.yml` lee variables desde `.env`, asi que `DB_DATABASE`, `DB_USERNAME` y `DB_PASSWORD` deben coincidir con lo que usara Laravel.

## Levantar base de datos y servicios

Desde `backend`:

```bash
docker compose -f docker.compose.yml up -d
```

Verificar contenedores:

```bash
docker compose -f docker.compose.yml ps
```

Ver logs si algo falla:

```bash
docker compose -f docker.compose.yml logs -f pgsql
docker compose -f docker.compose.yml logs -f redis
docker compose -f docker.compose.yml logs -f mailpit
```

## Base de datos

Ejecutar migraciones:

```bash
php artisan migrate
```

Ejecutar seeders:

```bash
php artisan db:seed
```

O hacer ambas cosas juntas:

```bash
php artisan migrate --seed
```

Recrear la base de datos local desde cero:

```bash
php artisan migrate:fresh --seed
```

## Ejecutar el backend

Servidor HTTP local:

```bash
php artisan serve
```

La API quedara disponible en:

```text
http://127.0.0.1:8000/api
```

Si necesitas procesar colas con `QUEUE_CONNECTION=database`:

```bash
php artisan queue:listen --tries=1
```

Para desarrollo normal, el `.env` sugerido usa `QUEUE_CONNECTION=sync`, asi que no hace falta levantar worker.

## Pruebas

Ejecutar la suite:

```bash
composer test
```

Alternativa directa:

```bash
php artisan test
```

## Comandos utiles

Limpiar caches de Laravel:

```bash
php artisan optimize:clear
```

Regenerar autoload de Composer:

```bash
composer dump-autoload
```

Apagar servicios Docker:

```bash
docker compose -f docker.compose.yml down
```

Apagar y borrar volumenes de base de datos/Redis:

```bash
docker compose -f docker.compose.yml down -v
```

Usa `down -v` solo si quieres borrar los datos locales y volver a migrar desde cero.

## Flujo recomendado diario

```bash
cd backend
docker compose -f docker.compose.yml up -d
composer install
php artisan migrate
php artisan serve
```

Panel de correos local:

```text
http://localhost:8025
```

