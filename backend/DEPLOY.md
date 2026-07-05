# SGI Backend - despliegue con Docker Compose

Esta guia prepara el backend Laravel para produccion en un VPS, Ubuntu Server o servidor casero con Docker. El frontend se despliega aparte, por ejemplo en Vercel.

## Estructura esperada

El backend Laravel vive dentro de `backend/` y no requiere mover archivos:

- `composer.json`
- `artisan`
- `.env.example`
- `app/`
- `bootstrap/`
- `config/`
- `database/`
- `public/`
- `routes/`
- `storage/`

## Requisitos del servidor

Instala Docker Engine y el plugin Docker Compose en Ubuntu:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Cierra sesion y vuelve a entrar para aplicar el grupo `docker`.

## Variables de entorno

En el servidor, copia la plantilla:

```sh
cd backend
cp .env.example .env
```

Completa manualmente estas variables antes de levantar contenedores:

- `APP_KEY`: genera con `docker compose -f docker-compose.prod.yml run --rm app php artisan key:generate --show` o temporalmente con PHP local.
- `APP_URL`: URL publica de la API, por ejemplo `https://api.tudominio.com`.
- `FRONTEND_URL`: URL del frontend, por ejemplo `https://tufrontend.vercel.app`.
- `DB_PASSWORD`: contrasena fuerte para PostgreSQL.
- `REDIS_PASSWORD`: contrasena fuerte para Redis.
- `RUSTFS_ACCESS_KEY_ID` y `RUSTFS_SECRET_ACCESS_KEY`: credenciales fuertes para RustFS.
- `RUSTFS_URL`: URL publica del bucket si vas a servir archivos directamente desde storage; si no, puede quedar vacia.
- `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`: valores aleatorios seguros.
- `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME`: dominio, puerto y esquema usados por el cliente WebSocket.
- `MAIL_*`: credenciales SMTP reales.
- `FIREBASE_CREDENTIALS`: ruta dentro del contenedor. Por defecto: `/var/www/html/storage/app/firebase/firebase_credentials.json`.
- `TRUSTED_PROXIES`: proxies de confianza para que Laravel interprete correctamente los headers `X-Forwarded-*`.
  Usa `*` si solo hay un proxy interno Docker. Si hay un proxy externo (Nginx, Caddy, Cloudflare),
  restringe al rango de la red interna de Docker: `172.16.0.0/12`.

No subas `.env` ni credenciales reales al repositorio.

## Credenciales Firebase

Guarda el JSON real en el volumen persistente de `storage`. Una forma practica:

```sh
docker compose -f docker-compose.prod.yml exec app mkdir -p storage/app/firebase
docker compose -f docker-compose.prod.yml cp firebase_credentials.json app:/var/www/html/storage/app/firebase/firebase_credentials.json
docker compose -f docker-compose.prod.yml exec app php artisan config:clear
```

El archivo `firebase_credentials.json` esta ignorado por Git y por Docker build.

## Levantar produccion

Desde `backend/`:

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app php artisan migrate --force
docker compose -f docker-compose.prod.yml exec app php artisan config:cache
docker compose -f docker-compose.prod.yml exec app php artisan route:cache
docker compose -f docker-compose.prod.yml exec app php artisan view:cache
docker compose -f docker-compose.prod.yml exec app php artisan queue:restart
```

Tambien puedes usar:

```sh
sh scripts/deploy.sh
```

El script valida precondiciones antes de desplegar:
- Que el `.env` exista.
- Que `APP_KEY` no este vacio.
- Que `APP_DEBUG` sea `false`.
- Que `DB_PASSWORD` tenga un valor distinto al placeholder.

Si alguna condicion falla, el script aborta con un mensaje claro.

En Linux puedes hacerlo ejecutable:

```sh
chmod +x scripts/deploy.sh scripts/fresh-local.sh
```

## Servicios incluidos

- `nginx`: entrada HTTP para la API y proxy WebSocket hacia Reverb.
- `app`: Laravel con PHP 8.4 FPM.
- `queue`: worker `php artisan queue:work redis --tries=3`.
- `scheduler`: scheduler `php artisan schedule:work`.
- `reverb`: servidor WebSocket `php artisan reverb:start`.
- `pgsql`: PostgreSQL 16 con PostGIS.
- `redis`: Redis con password.
- `rustfs`: almacenamiento compatible con S3.
- `rustfs-init`: crea el bucket inicial si no existe.

## Puertos y seguridad

Por defecto, solo se publica Nginx en `127.0.0.1:8000`.

- `APP_HTTP_BIND=127.0.0.1` mantiene la API solo accesible localmente en el servidor.
- Usa Nginx del host, Caddy, Traefik o Cloudflare Tunnel para publicar HTTPS.
- No publiques PostgreSQL (`5432`) ni Redis (`6379`) a internet.
- No publiques la consola de RustFS (`9001`) a internet.
- Si necesitas exponer RustFS, hazlo detras de HTTPS, autenticacion y reglas de red estrictas.

Para pruebas sin proxy externo puedes cambiar temporalmente:

```env
APP_HTTP_BIND=0.0.0.0
APP_HTTP_PORT=8000
```

No lo dejes asi en produccion publica sin firewall o proxy seguro.

## Logs y diagnostico

```sh
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f queue
docker compose -f docker-compose.prod.yml logs -f reverb
docker compose -f docker-compose.prod.yml logs -f scheduler
docker compose -f docker-compose.prod.yml exec app php artisan about
```

## Actualizar despues de cambios

Desde `backend/` en el servidor:

```sh
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml exec app php artisan migrate --force
docker compose -f docker-compose.prod.yml exec app php artisan optimize:clear
docker compose -f docker-compose.prod.yml exec app php artisan config:cache
docker compose -f docker-compose.prod.yml exec app php artisan route:cache
docker compose -f docker-compose.prod.yml exec app php artisan view:cache
docker compose -f docker-compose.prod.yml exec app php artisan queue:restart
```

O ejecuta:

```sh
sh scripts/deploy.sh
```

## Entorno local de pruebas

El archivo `docker.compose.yml` existente queda para infraestructura local. Si quieres reiniciar todo localmente:

```sh
sh scripts/fresh-local.sh --yes
```

Ese comando elimina volumenes locales, levanta infraestructura y ejecuta `php artisan migrate:fresh --seed`.

## Notas sobre Octane

El proyecto ya incluye Laravel Octane. Este stack usa PHP-FPM + Nginx por estabilidad operativa. Si luego quieres servir la API con Octane/Swoole, instala y habilita la extension Swoole/OpenSwoole en la imagen y cambia el comando del servicio `app` a:

```sh
php artisan octane:start --server=swoole --host=0.0.0.0 --port=8000
```

Antes de activar Octane en produccion conviene validar compatibilidad de paquetes, fugas de estado entre requests y estrategia de reload.
