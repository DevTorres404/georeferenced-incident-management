# SGI - Sistema de Gestion de Incidencias Georreferenciadas

SGI es una aplicacion web para registrar, consultar, asignar y dar seguimiento a incidencias georreferenciadas. El proyecto esta dividido en dos partes:

- `backend/`: API REST en Laravel, organizada con enfoque Hexagonal / DDD.
- `frontend/`: frontend estatico con HTML, CSS, JavaScript, Bootstrap y AdminLTE.

El backend se ejecuta localmente con PHP y Composer. Docker se usa para servicios de apoyo como PostgreSQL/PostGIS, Redis, Mailpit y el servidor nginx del frontend.

## Requisitos

- PHP 8.3 o superior.
- Composer.
- Docker Desktop.
- Node.js solo si se van a compilar assets del backend o trabajar dependencias del template.
- Extensiones PHP necesarias: `pdo_pgsql`, `pgsql`, `curl`, `openssl`, `sodium`, `mbstring`, `fileinfo`, `zip`.

## Puertos usados

- Frontend: `http://localhost:5500`
- Backend Laravel: `http://127.0.0.1:8000`
- API desde el frontend: `http://localhost:5500/api`
- PostgreSQL/PostGIS: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`
- Mailpit: `http://localhost:8025`

## Levantar el proyecto

### 1. Servicios del backend con Docker

Desde la carpeta del backend:

```bash
cd backend
docker compose -f docker.compose.yml up -d
```

Esto levanta:

- PostgreSQL con PostGIS.
- Redis.
- Mailpit para probar correos.

Para detenerlos:

```bash
docker compose -f docker.compose.yml down
```

### 2. Configurar el backend local

Desde `backend/`:

```bash
composer install
copy .env.example .env
php artisan key:generate
```

En `.env`, para correr Laravel local contra los servicios Docker, usa valores como estos:

```env
APP_URL=http://127.0.0.1:8000

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=incident_management_system
DB_USERNAME=user_im
DB_PASSWORD=your_database_password_here

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
CACHE_STORE=redis
```

Si cambias `DB_USERNAME`, `DB_PASSWORD` o `DB_DATABASE`, asegurate de que coincidan con los valores usados por `backend/docker.compose.yml`.

### 3. Migraciones y seeders

Desde `backend/`:

```bash
php artisan migrate
php artisan db:seed
```

Si necesitas reiniciar la base de datos en desarrollo:

```bash
php artisan migrate:fresh --seed
```

### 4. Ejecutar backend

Desde `backend/`:

```bash
php artisan serve
```

El backend queda disponible en:

```text
http://127.0.0.1:8000
```

Procesos opcionales durante desarrollo:

```bash
php artisan queue:listen
php artisan reverb:start
php artisan pail
```

### 5. Levantar frontend en Docker

Desde la carpeta del frontend:

```bash
cd ../frontend
docker compose up -d
```

Abrir:

```text
http://localhost:5500
```

El nginx del frontend sirve `frontend/app` y proxya las llamadas `/api` hacia el backend local en `host.docker.internal:8000`.

Para reiniciar el frontend despues de cambios:

```bash
docker compose restart frontend
```

En la mayoria de cambios HTML/CSS/JS basta con refrescar el navegador. Si el navegador mantiene cache, usar `Ctrl + F5`.

## Levantamiento sin Docker

Tambien se puede levantar el proyecto sin Docker, siempre que tengas instalados localmente PostgreSQL con PostGIS, Redis, PHP y Composer.

### 1. Base de datos y servicios locales

Instalar y dejar corriendo:

- PostgreSQL 16 o compatible.
- Extension PostGIS habilitada.
- Redis.
- Un servidor SMTP real o Mailpit instalado localmente si se quieren probar correos.

Crear la base de datos y habilitar PostGIS:

```sql
CREATE DATABASE incident_management_system;
\c incident_management_system
CREATE EXTENSION IF NOT EXISTS postgis;
```

Crear el usuario que usara Laravel o ajustar `.env` con un usuario existente:

```sql
CREATE USER user_im WITH PASSWORD 'your_database_password_here';
GRANT ALL PRIVILEGES ON DATABASE incident_management_system TO user_im;
```

En `backend/.env` usar valores locales:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=incident_management_system
DB_USERNAME=user_im
DB_PASSWORD=your_database_password_here

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 2. Backend sin Docker

Desde `backend/`:

```bash
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

El backend queda en:

```text
http://127.0.0.1:8000
```

### 3. Frontend sin Docker

El frontend es estatico, pero debe servirse por HTTP, no abrirse con `file://`.

Opcion con PHP:

```bash
cd frontend/app
php -S localhost:5500
```

Opcion con Node, si tienes `npx` disponible:

```bash
cd frontend/app
npx http-server -p 5500
```

Abrir:

```text
http://localhost:5500
```

Importante: sin nginx Docker no existe el proxy `/api` hacia Laravel. En ese caso el frontend debe apuntar directamente al backend local. La forma mas simple es definir antes de cargar los modulos:

```html
<script>
  window.SGI_API_URL = 'http://127.0.0.1:8000/api';
</script>
```

Si se usa este modo, revisar que el backend permita CORS desde `http://localhost:5500`.

## Arquitectura del backend

El backend sigue una arquitectura Hexagonal / DDD por contextos funcionales dentro de `backend/app`.

Capas principales:

- `Domain/`: entidades, contratos de repositorio y reglas del dominio. No debe depender de Laravel ni Eloquent.
- `Application/`: casos de uso y DTOs. Orquesta flujos del sistema sin responder HTTP directamente.
- `Infrastructure/`: controladores HTTP, modelos Eloquent, repositorios concretos y mapeadores.

Reglas importantes:

- Las rutas estan en `backend/routes/api.php`.
- La autenticacion usa Laravel Sanctum.
- La autenticacion de dos factores aplica para usuarios administrativos.
- Los permisos se validan en backend con middleware.
- El frontend solo oculta o bloquea acciones segun permisos recibidos; la regla real vive en backend.

## Arquitectura del frontend

El frontend no usa React, Vue ni Angular. Se mantiene como frontend estatico con Bootstrap, AdminLTE y JavaScript modular.

Estructura principal:

```text
frontend/app/js/
  core/
    api-client.js
    auth-session.js
    config.js
    router.js
    storage.js
  layout/
    layout.js
    sidebar.js
    topbar.js
    loader.js
  shared/
    sanitizer.js
    utils/
    validators/
  modules/
    auth/
    catalogs/
    dashboard/
    incidents/
    profile/
    reports/
    roles/
    users/
```

Responsabilidades:

- `core/`: configuracion global, cliente HTTP, sesion y utilidades base.
- `layout/`: sidebar, topbar, menu de usuario y loader.
- `shared/`: utilidades compartidas, validaciones y sanitizacion.
- `modules/`: logica por dominio funcional.
- `presentation/`: eventos, renderizado y comportamiento de pantalla.
- `application/`: flujos y servicios de aplicacion del modulo.
- `infrastructure/`: integraciones especificas del modulo cuando aplica.

Reglas frontend:

- Las pantallas no deben llamar directamente a `fetch`.
- El unico `fetch` central debe estar en `frontend/app/js/core/api-client.js`.
- Los textos visibles van en espanol.
- Los nombres tecnicos de archivos, carpetas, funciones y modulos van en ingles.
- No hardcodear usuarios, roles, permisos, estados ni prioridades.
- Usar `shared/sanitizer.js` o helpers equivalentes antes de insertar datos no confiables en HTML.

## CSS

El CSS personalizado se carga desde `frontend/app/css/app.css`, que importa archivos por responsabilidad:

```text
frontend/app/css/
  app.css
  base/
  components/
  layout/
  pages/
```

Bootstrap y AdminLTE siguen siendo la base visual. El CSS propio debe limitarse a identidad SGI, sidebar, logo, loader, estados, tablas y ajustes puntuales.

## Comandos utiles

Backend:

```bash
cd backend
php artisan serve
php artisan migrate
php artisan db:seed
php artisan migrate:fresh --seed
php artisan queue:listen
php artisan reverb:start
php artisan test
```

Servicios Docker del backend:

```bash
cd backend
docker compose -f docker.compose.yml up -d
docker compose -f docker.compose.yml down
```

Frontend:

```bash
cd frontend
docker compose up -d
docker compose restart frontend
docker compose down
```

## Notas de desarrollo

- Si el login con Google falla en backend por certificados de PHP/cURL, revisar la configuracion de certificados en `php.ini`.
- Si Composer pide `ext-sodium`, habilitar `sodium` en el `php.ini` usado por CLI.
- Si Redis no conecta desde Laravel local, revisar que `REDIS_HOST=127.0.0.1`.
- Si el frontend muestra una version anterior, refrescar con `Ctrl + F5` o subir el query string de cache (`?v=...`) del recurso modificado.
- No subir credenciales reales, llaves Firebase, contrasenas ni archivos `.env`.

## Flujo recomendado para trabajar

1. Levantar servicios Docker del backend.
2. Ejecutar Laravel local con `php artisan serve`.
3. Levantar frontend con Docker.
4. Abrir `http://localhost:5500`.
5. Hacer cambios por modulo, evitando mezclar backend y frontend en el mismo commit cuando no sea necesario.
