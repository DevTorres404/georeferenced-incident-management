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
- RustFS API S3: `http://127.0.0.1:9000`
- RustFS consola: `http://127.0.0.1:9001`

## Despliegue local completo recomendado

Este es el flujo recomendado para trabajar el proyecto completo en local sin meter Laravel en Docker:

- **Backend Laravel local** con PHP y Composer.
- **Base de datos y servicios de apoyo en Docker**: PostgreSQL/PostGIS, Redis y Mailpit.
- **Frontend en Docker** sirviendo `frontend/app` por nginx en `http://localhost:5500`.

Este modo no afecta el levantamiento sin Docker porque no requiere cambiar el codigo del frontend ni modificar `frontend/app/js/core/config.js`. El frontend usa el proxy `/api` de nginx y el backend sigue corriendo normalmente en `http://127.0.0.1:8000`.

### Resumen rapido

Terminal 1, servicios de apoyo:

```bash
cd backend
docker compose -f docker.compose.yml up -d
```

Terminal 2, backend Laravel:

```bash
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

Terminal 3, frontend:

```bash
cd frontend
docker compose up -d
```

Abrir:

```text
http://localhost:5500
```

Si ya tienes `.env`, dependencias y migraciones listas, normalmente solo necesitas:

```bash
cd backend
docker compose -f docker.compose.yml up -d
php artisan serve
```

y en otra terminal:

```bash
cd frontend
docker compose up -d
```

## Paso a paso del despliegue local recomendado

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
- RustFS para almacenar evidencias y adjuntos compatibles con S3.

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

INCIDENT_FILESYSTEM_DISK=rustfs
RUSTFS_ACCESS_KEY_ID=rustfsadmin
RUSTFS_SECRET_ACCESS_KEY=rustfsadmin123
RUSTFS_REGION=us-east-1
RUSTFS_BUCKET=sgi-incidents
RUSTFS_ENDPOINT=http://127.0.0.1:9000
RUSTFS_URL=http://127.0.0.1:9000/sgi-incidents
RUSTFS_USE_PATH_STYLE_ENDPOINT=true
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

## Almacenamiento de evidencias con RustFS

Las imagenes y archivos adjuntos de incidencias no se guardan como binarios en PostgreSQL. El backend guarda el archivo en RustFS y registra en la base de datos solo la metadata en `core.incident_attachments`:

- `incident_id`
- `user_id`
- `original_name`
- `file_path`
- `mime_type`
- `file_size_bytes`
- `file_hash`

Laravel usa el disco configurado en:

```env
INCIDENT_FILESYSTEM_DISK=rustfs
```

El disco `rustfs` esta definido en `backend/config/filesystems.php` usando el driver `s3`, por lo que requiere la dependencia:

```bash
composer require league/flysystem-aws-s3-v3:^3.0
```

En desarrollo local, el `docker.compose.yml` del backend levanta RustFS y crea automaticamente el bucket `sgi-incidents`. La consola queda disponible en:

```text
http://127.0.0.1:9001
```

Usa las credenciales definidas en `.env`:

```env
RUSTFS_ACCESS_KEY_ID=rustfsadmin
RUSTFS_SECRET_ACCESS_KEY=rustfsadmin123
```

Si RustFS no esta disponible temporalmente durante pruebas locales, se puede volver al almacenamiento local sin cambiar codigo:

```env
INCIDENT_FILESYSTEM_DISK=public
```

Despues de cambiar variables de entorno, limpiar configuracion:

```bash
php artisan config:clear
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

### 6. Verificar conexion frontend-backend

Con este modo recomendado no debes abrir archivos con `file://`. Siempre entra por:

```text
http://localhost:5500
```

El frontend llama a:

```text
http://localhost:5500/api
```

y nginx lo reenvia al backend local:

```text
http://127.0.0.1:8000/api
```

Por eso, para este modo no agregues manualmente:

```html
<script>
  window.SGI_API_URL = 'http://127.0.0.1:8000/api';
</script>
```

Ese ajuste solo aplica cuando levantas el frontend sin Docker.

### 7. Apagar el entorno recomendado

Detener el frontend:

```bash
cd frontend
docker compose down
```

Detener servicios de apoyo del backend:

```bash
cd backend
docker compose -f docker.compose.yml down
```

El backend local se detiene con `Ctrl + C` en la terminal donde corre `php artisan serve`.

## Levantamiento sin Docker

Tambien se puede levantar el proyecto sin Docker, siempre que tengas instalados localmente PostgreSQL con PostGIS, Redis, PHP y Composer.

Este modo es independiente del despliegue recomendado. Usalo solo si no quieres usar Docker Desktop para ningun servicio. En este caso si debes configurar la URL directa del backend en el frontend, porque no existe el proxy nginx `/api`.

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

Cuando vuelvas al modo recomendado con frontend en Docker, quita ese `window.SGI_API_URL` si lo agregaste en un HTML, o deja el valor por defecto de `frontend/app/js/core/config.js` para que vuelva a usar `/api`.

## Arquitectura del backend

El backend sigue estrictamente una **Arquitectura Modular basada en DDD (Domain-Driven Design) y Arquitectura Hexagonal**. En lugar de la estructura tradicional MVC de Laravel, el código en `backend/app/` está organizado por **módulos o contextos funcionales** (ej: `Auth/`, `Incidents/`, `Users/`, `Catalogs/`).

Dentro de cada módulo, se aplican las siguientes capas:

- **`Domain/`**: Contiene la lógica central de negocio (Entidades, Value Objects, contratos/interfaces de repositorios y eventos del dominio). Esta capa es **agnóstica** al framework, no depende de Laravel ni de Eloquent.
- **`Application/`**: Contiene los Casos de Uso (Use Cases o Services) y DTOs. Orquesta los flujos del sistema utilizando las interfaces del dominio, sin interactuar directamente con peticiones HTTP o la base de datos directamente.
- **`Infrastructure/`**: Contiene la implementación técnica de las interfaces del dominio. Aquí residen los Controladores HTTP, Modelos de Eloquent, Repositorios concretos y recursos de integración externos.

Reglas importantes del backend:

- Las rutas están centralizadas en `backend/routes/api.php`.
- La autenticación principal usa **Laravel Sanctum**.
- La base de datos, el sistema de roles y los catálogos no deben estar hardcodeados; todo proviene de la base de datos a través de las capas de infraestructura.
- Los permisos se validan robustamente en el backend mediante middleware o policies. El frontend solo adapta la UI (oculta botones/menús), pero la verdadera regla y seguridad reside en el backend.

## Conexión Frontend - Backend

El SGI opera bajo un modelo desacoplado (Headless), donde el frontend (Vanilla JS) y el backend (Laravel) se comunican exclusivamente mediante una **API REST**.

### Configurar la URL del backend según el modo de ejecución

El backend no necesita cambios especiales para conectarse al frontend: normalmente se mantiene corriendo en:

```text
http://127.0.0.1:8000
```

El ajuste importante está en el frontend, en:

```text
frontend/app/js/core/config.js
```

Ese archivo define la URL base de la API:

```js
export const API_URL = window.SGIG_API_URL || window.SGI_API_URL || `${window.location.origin}/api`;
```

#### Frontend con Docker

Si el frontend corre con Docker en `http://localhost:5500`, se puede dejar el valor por defecto:

```js
`${window.location.origin}/api`
```

En ese modo, nginx del frontend recibe las peticiones en:

```text
http://localhost:5500/api
```

y las redirige al backend local en:

```text
http://127.0.0.1:8000/api
```

#### Frontend sin Docker

Si el frontend se levanta sin Docker con `php -S localhost:5500` o `npx http-server -p 5500`, no existe el proxy nginx de `/api`. En ese caso se debe apuntar directamente al backend local.

Opción recomendada: definir la URL antes de cargar los módulos principales en los HTML:

```html
<script>
  window.SGI_API_URL = 'http://127.0.0.1:8000/api';
</script>
```

Opción alternativa: cambiar temporalmente `frontend/app/js/core/config.js` durante desarrollo local:

```js
export const API_URL = 'http://127.0.0.1:8000/api';
```

Cuando se usa frontend sin Docker, revisar también `backend/.env` para permitir el origen del frontend:

```env
FRONTEND_URL=http://localhost:5500
SANCTUM_STATEFUL_DOMAINS=localhost:5500,127.0.0.1:5500
SESSION_DOMAIN=localhost
```

Después de cambiar `.env`, limpiar configuración del backend:

```bash
cd backend
php artisan config:clear
```

## Mapa con MapLibre GL JS y OpenFreeMap

El sistema incluye una pantalla de mapa para visualizar incidencias georreferenciadas:

```text
frontend/app/html/incident-map.html
```

El backend expone los puntos desde:

```text
GET /api/incidents/map
```

La pantalla usa **MapLibre GL JS** con **OpenFreeMap** como proveedor de estilo y mapa base vectorial. No requiere token, tarjeta ni configuracion externa. La base de datos sigue siendo PostgreSQL/PostGIS; MapLibre solo se usa como capa visual en el frontend.

La pantalla de creacion de incidencias tambien usa MapLibre:

- Permite seleccionar coordenadas haciendo clic en el mapa.
- Permite mover un marcador arrastrable.
- Autocompleta los campos de latitud y longitud.
- Si el usuario escribe coordenadas manualmente, el marcador se mueve a esa ubicacion.
- Valida que latitud y longitud esten completas y dentro de rango antes de enviar.

Por defecto el mapa centra en Santa Elena, Ecuador. Opcionalmente se puede ajustar el centro inicial o el estilo:

```html
<script>
  window.SGI_MAP_DEFAULT_CENTER = [-80.8587, -2.2262];
  window.SGI_MAP_DEFAULT_ZOOM = 12;
  window.SGI_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
</script>
```

### Flujo de Comunicación:

1. **Cliente HTTP Centralizado**: Todas las peticiones desde el frontend hacia el backend pasan por un único punto: `frontend/app/js/core/api-client.js`. Este módulo se encarga de inyectar automáticamente el token de autenticación (`Bearer`) y las cabeceras requeridas (como `Accept: application/json`).
2. **Autenticación (Sanctum/Firebase)**: El usuario inicia sesión y obtiene un token (ya sea manejado por Firebase y luego intercambiado en el backend, o emitido directamente por Sanctum). El frontend guarda este token en `storage.js` y el `api-client.js` lo usa en subsiguientes peticiones HTTP.
3. **Manejo de CORS y Proxy**: En el entorno Docker, el servidor Nginx del frontend (`localhost:5500`) actúa como un proxy inverso para la ruta `/api`, reenviando internamente las peticiones al contenedor del backend. Cuando se ejecuta sin Docker, el frontend debe apuntar a la URL completa del backend local (ej. `http://127.0.0.1:8000/api`) y el backend de Laravel debe estar configurado para aceptar peticiones CORS desde el origen del frontend.
4. **Respuestas Globales**: El `api-client.js` intercepta errores globales (como `401 Unauthorized` o `403 Forbidden`) para destruir la sesión del frontend y redirigir al login o mostrar alertas genéricas de denegación de acceso.
5. **Carga de UI Dinámica**: Tras autenticarse, el frontend consume los endpoints del backend para obtener el perfil del usuario, roles, permisos y menús habilitados para renderizar dinámicamente el `sidebar` y `topbar` basado en las restricciones impuestas por Laravel.

## Arquitectura del frontend

El frontend no usa React, Vue ni Angular. Se mantiene como un **frontend Vanilla JS altamente modular** (utilizando ES6 Modules nativos), montado sobre Bootstrap y AdminLTE. Para evitar el típico código espagueti de Vanilla JS, se implementó una **Arquitectura por Módulos y Capas (inspirada en DDD)**, lo cual mantiene una fuerte consistencia conceptual con el diseño del backend.

### Estructura Principal (`frontend/app/js/`)

- **`core/`**: Infraestructura base de la aplicación. Aquí vive el `api-client.js` (cliente HTTP centralizado que maneja tokens), `router.js` (enrutamiento en el cliente), `auth-session.js` y `storage.js`.
- **`layout/`**: Componentes globales de la interfaz (Application Shell). Contiene la lógica del `sidebar.js`, `topbar.js` y `loader.js`.
- **`shared/`**: Utilidades puras compartidas entre múltiples dominios, como `sanitizer.js` para evitar ataques XSS, utilidades de manipulación del DOM y validadores genéricos.
- **`modules/`**: El corazón del sistema (Vertical Slicing). Cada funcionalidad principal (ej. `auth`, `incidents`, `roles`, `users`) es un módulo independiente que agrupa todo su código.

### Capas dentro de cada Módulo (`modules/`)

Al igual que en el backend, los módulos complejos se subdividen en sus propias capas internas:
- **`application/`**: Contiene los "Services" (ej. `incidents-service.js`). Agrupa la lógica de flujos del frontend y delega las peticiones HTTP a `core/api-client.js`.
- **`infrastructure/`**: Para configuraciones o SDKs externos específicos de ese módulo (ej. `firebase-config.js` dentro del módulo `auth`).
- **`presentation/`**: Contiene las "Pages" o controladores de "UI" (ej. `incidents-page.js`). Es la única capa que interactúa con el DOM, inyecta datos HTML y captura eventos de usuario, delegando la lógica de procesamiento a `application/`.

### Reglas Críticas del Frontend:

- Las pantallas y controladores (`presentation`) **NUNCA** deben llamar directamente a `fetch` ni manipular cabeceras HTTP o tokens. Todo pasa por sus respectivos services en `application` y finalmente por el único `fetch` en `core/api-client.js`.
- El frontend usa importaciones de módulos nativos (`<script type="module">`), por lo que el desarrollo local es inmediato y no depende de compilar con Webpack o Vite en tiempo real.
- Todos los textos visibles en la interfaz para el usuario final van estrictamente en **español**.
- Los nombres técnicos de archivos, carpetas, clases, funciones y variables van estrictamente en **inglés**.
- **Regla de Oro:** No se deben hardcodear usuarios, roles, permisos, menús, estados de incidencias ni prioridades. La UI debe construirse dinámicamente según la información provista por la API del backend.
- Siempre se debe usar `shared/sanitizer.js` o helpers equivalentes antes de insertar datos externos o no confiables en el DOM mediante `innerHTML`.

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

## Pruebas del backend

El backend usa PHPUnit a traves de `php artisan test`. La configuracion de testing esta en `backend/phpunit.xml` y apunta a PostgreSQL/PostGIS:

- Base de datos: `incident_management_system_testing`
- Usuario: `user_im`
- Password: `pass_im`
- Broadcast: `null`
- Queue: `sync`
- Cache y sesion: memoria local de testing

Crear la base de pruebas una sola vez:

```sql
CREATE DATABASE incident_management_system_testing;
\c incident_management_system_testing
CREATE EXTENSION IF NOT EXISTS postgis;
```

Ejecutar pruebas desde `backend/`:

```bash
php artisan config:clear
php artisan migrate:fresh --seed --env=testing
php artisan test
```

Comandos frecuentes:

```bash
php artisan test --testsuite=Feature
php artisan test --testsuite=Unit
php artisan test tests/Feature/IncidentsTest.php
php artisan test --stop-on-failure
composer test
```

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
