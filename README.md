# SGI — Sistema de Gestión de Incidencias Georreferenciadas

[![Estado](https://img.shields.io/badge/Status-Producción_Ready-success?style=for-the-badge)](https://app.labtorres.me/)
[![Arquitectura](https://img.shields.io/badge/Architecture-Hexagonal_%7C_DDD-blue?style=for-the-badge)](#arquitectura-del-backend)
[![Backend](https://img.shields.io/badge/Backend-Laravel_11-red?style=for-the-badge)](https://laravel.com/)
[![DB](https://img.shields.io/badge/Database-PostgreSQL_%2B_PostGIS-316192?style=for-the-badge)](https://postgis.net/)
[![Despliegue](https://img.shields.io/badge/Deploy-Docker_%7C_Vercel-black?style=for-the-badge)](#infraestructura-y-despliegue-de-producción)
[![Tests](https://img.shields.io/badge/Tests-197_passed_%7C_1201_assertions-brightgreen?style=for-the-badge)](#pruebas-automatizadas)

> **Demo en Producción:** [https://app.labtorres.me/](https://app.labtorres.me/)
>
> Backend desplegado en homelab (Docker) · Frontend estático en Vercel (CDN global)

---

SGI es una plataforma web de nivel industria para registrar, consultar, asignar y dar seguimiento a incidencias con coordenadas georreferenciadas reales. El sistema gestiona el ciclo de vida completo de una incidencia: desde el reporte ciudadano, pasando por la revisión del supervisor, la asignación a operadores, hasta el cierre y reapertura con trazabilidad histórica completa.

---

## Decisiones de Arquitectura

### Por qué Hexagonal + DDD

El proyecto **no usa el MVC clásico de Laravel**. Cambiar de repositorio o de framework de persistencia (Eloquent → otro ORM) no debería tocar la lógica de negocio. Por eso se adoptó una separación explícita de capas:

```
app/
├── Incidents/
│   ├── Domain/         → Entidades, Value Objects, contratos de repositorio
│   │                     (agnóstico al framework, sin Eloquent)
│   ├── Application/    → Casos de Uso, DTOs, orquestación de flujos
│   └── Infrastructure/ → Controladores HTTP, Repositorios Eloquent, integraciones externas
├── Auth/
├── Users/
└── Catalogs/
```

### Por qué Headless (Backend separado del Frontend)

- **Frontend estático en Vercel:** CDN global, zero-server, carga ultra-rápida en cualquier región.
- **Backend en contenedores propios:** PostgreSQL, Redis y la lógica de negocio quedan en una red privada, sin exposición directa.
- **Resultado:** Escalabilidad independiente. Si el tráfico del frontend explota, Vercel lo absorbe sin tocar el backend. Si se necesita más potencia de cómputo, se migra la imagen Docker a un VPS sin tocar una línea de frontend.

### Por qué Vanilla JS modular (sin React/Vue/Angular)

El frontend aplica los mismos principios DDD del backend: módulos por dominio con capas internas (`application/`, `infrastructure/`, `presentation/`). Esto evita el "código espagueti" típico de Vanilla JS sin añadir overhead de un SPA framework para una app de gestión con renderizado server-first.

---

## Stack Tecnológico

| Capa | Tecnología |
|:---|:---|
| Backend API | PHP 8.3 + Laravel 11 (Sanctum · Reverb · Queues) |
| Base de Datos | PostgreSQL 16 + **PostGIS** (datos geoespaciales reales) |
| Caché / Colas | Redis |
| Almacenamiento S3 | RustFS (compatible con AWS S3 SDK) |
| WebSockets | Laravel Reverb |
| Frontend | Vanilla JS ES6 Modules · Bootstrap · AdminLTE |
| Mapas | MapLibre GL JS + OpenFreeMap (sin token, sin costo) |
| Servidor Web | Nginx (Alpine) |
| Contenedores | Docker & Docker Compose |
| Testing | PHPUnit · 197 tests · 1201 assertions |
| CI/CD Frontend | Vercel |

---

## Características Técnicas Destacadas

### Base de Datos
- **Triggers y Funciones PL/pgSQL nativos** creados mediante migraciones:
  - `trg_actualizar_ubicacion` — sincroniza `latitude`/`longitude` con `GEOMETRY(Point, 4326)` de PostGIS automáticamente en cada `INSERT`/`UPDATE`.
  - `trg_calcular_fecha_limite` — calcula el `due_date` de una incidencia aplicando el SLA (en horas) de la prioridad asignada.
- **Esquemas separados:** `core` (incidencias, asignaciones, ciclos, catálogos) y `auth` (usuarios, roles, permisos, tokens).
- **Ciclos de vida (`incident_cycles`):** cada reapertura genera un nuevo ciclo histórico; las asignaciones anteriores se desactivan y se clonan al ciclo nuevo, preservando la trazabilidad completa.
- **Normalización estricta (3NF):** estados, prioridades, categorías, unidades territoriales y roles viven en tablas propias. La UI los consume desde la API; nada está hardcodeado.

### Seguridad
- **Doble validación:** el frontend previene (UX), el backend es el juez final (seguridad real con Policies y Middleware).
- **Permisos granulares:** cada endpoint valida el permiso específico del usuario autenticado, no solo su rol.
- **Sanctum Tokens:** autenticación stateless por Bearer token con rotación y revocación.
- **Sanitización XSS:** todo dato externo insertado en el DOM pasa por `shared/sanitizer.js`.

### Infraestructura Docker (Producción)
El `docker-compose.prod.yml` levanta:
- `app` — PHP-FPM con la API Laravel.
- `nginx` — proxy reverso, sirve assets estáticos y enruta a PHP-FPM.
- `migrate` — servicio one-shot que corre migraciones antes de que `app` arranque (`condition: service_completed_successfully`).
- `queue` — worker de colas para jobs asíncronos (notificaciones, procesamiento de imágenes).
- `scheduler` — cron interno para tareas programadas de Laravel.
- `pgsql` y `redis` — con health checks nativos de Docker.
- `reverb` — servidor WebSocket para notificaciones en tiempo real.

---

## Despliegue Local (Entorno Docker Recomendado)

Este modo emula la arquitectura de producción sin instalar dependencias del sistema operativo directamente.

### Requisitos
- PHP 8.3+ y Composer (solo para correr Laravel local)
- Docker Desktop

### 1 — Servicios de apoyo (DB, Redis, Storage, SMTP)

```bash
cd backend
docker compose -f docker.compose.yml up -d
```

Levanta: PostgreSQL/PostGIS · Redis · Mailpit · RustFS

### 2 — Configurar el backend

```bash
composer install
cp .env.example .env   # En Windows: copy .env.example .env
php artisan key:generate
```

Variables mínimas en `.env`:

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

### 3 — Migraciones y seeders

```bash
php artisan migrate:fresh --seed
```

### 4 — Arrancar la API

```bash
php artisan serve
# API disponible en http://127.0.0.1:8000
```

Procesos opcionales durante desarrollo:

```bash
php artisan queue:listen   # Workers de colas (notificaciones, jobs)
php artisan reverb:start   # WebSockets
php artisan pail           # Logs en tiempo real
```

### 5 — Frontend

```bash
cd frontend
docker compose up -d
# Aplicación en http://localhost:5500
```

El Nginx del frontend sirve `frontend/app` y proxya `/api` hacia `http://host.docker.internal:8000/api` automáticamente.

### Flujo mínimo (si ya tenés todo configurado)

```bash
# Terminal 1
cd backend && docker compose -f docker.compose.yml up -d && php artisan serve

# Terminal 2
cd frontend && docker compose up -d
```

Abrir: `http://localhost:5500`

---

## Mapas con MapLibre GL JS

El sistema incluye una pantalla de mapa interactivo (`frontend/app/html/incident-map.html`) que visualiza todas las incidencias georreferenciadas en tiempo real.

- Motor: MapLibre GL JS + OpenFreeMap (sin token, sin tarjeta, sin costo).
- Datos: el backend expone `GET /api/incidents/map` con coordenadas PostGIS.
- Creación interactiva: el formulario de nueva incidencia permite hacer clic en el mapa para seleccionar coordenadas, mover el marcador y autocompletar lat/lng.

Configuración opcional del mapa (centrado en Santa Elena, Ecuador por defecto):

```html
<script>
  window.SGI_MAP_DEFAULT_CENTER = [-80.8587, -2.2262];
  window.SGI_MAP_DEFAULT_ZOOM = 12;
  window.SGI_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
</script>
```

---

## Comunicación Frontend / Backend

1. **Cliente HTTP centralizado:** todas las peticiones pasan por `frontend/app/js/core/api-client.js`, que inyecta el Bearer token y las cabeceras requeridas.
2. **Autenticación:** Sanctum emite un token al login. El frontend lo persiste en `storage.js` y lo reutiliza en cada request.
3. **Proxy Nginx:** en entorno Docker, el Nginx del frontend reenvía `/api` al backend local. Sin Docker, configurar `window.SGI_API_URL = 'http://127.0.0.1:8000/api'` antes de cargar los módulos.
4. **Errores globales:** `api-client.js` intercepta `401`/`403` y destruye la sesión redirigiendo al login.
5. **UI dinámica:** roles, permisos, menús y estados de incidencias se obtienen de la API y nunca están hardcodeados en el HTML.

---

## Arquitectura del Frontend

```
frontend/app/js/
├── core/          → api-client.js, auth-session.js, storage.js, router.js
├── layout/        → sidebar.js, topbar.js, loader.js (Application Shell)
├── shared/        → sanitizer.js (anti-XSS), dom utils, validators
└── modules/       → Vertical Slicing por dominio
    ├── incidents/
    │   ├── application/    → incidents-service.js (lógica, sin DOM)
    │   ├── infrastructure/ → SDKs externos específicos del módulo
    │   └── presentation/   → incidents-page.js (DOM, eventos, render)
    ├── auth/
    ├── users/
    └── ...
```

**Regla de Oro:** las capas `presentation` nunca llaman `fetch` directamente. Todo fluye `presentation → application → core/api-client.js`.

---

## Pruebas Automatizadas

**197 tests · 1201 assertions** (PHPUnit vía `php artisan test`)

### Crear la base de datos de testing (una sola vez)

```sql
CREATE DATABASE incident_management_system_testing;
\c incident_management_system_testing
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Ejecutar la suite

```bash
cd backend
php artisan config:clear
php artisan migrate:fresh --seed --env=testing
php artisan test
```

### Comandos frecuentes

```bash
php artisan test --testsuite=Feature
php artisan test --testsuite=Unit
php artisan test tests/Feature/IncidentsTest.php
php artisan test --stop-on-failure
```

> Nota: no correr múltiples instancias de `php artisan test` en paralelo contra la misma base de datos. Los índices únicos y las transacciones concurrentes de PostgreSQL generan deadlocks.

---

## Infraestructura y Despliegue de Producción

### Arquitectura de producción real

```
Internet
   |
   v
[Vercel CDN] → Frontend estático (HTML/CSS/JS)
   | (llamadas API)
   v
[Homelab / VPS]
   └── Docker Compose
         ├── nginx          (proxy reverso, puerto 8000)
         ├── app            (PHP-FPM Laravel)
         ├── migrate        (one-shot, precondición de app)
         ├── queue          (workers asíncronos)
         ├── scheduler      (cron de Laravel)
         ├── reverb         (WebSockets)
         ├── pgsql          (PostgreSQL + PostGIS)
         └── redis          (caché, sesiones, colas)
```

### Despliegue de producción

```bash
cd backend
SGI_ENV_FILE=.env.production docker compose -f docker-compose.prod.yml up -d
```

Con `RUN_SEEDERS=true` en el `.env` de producción, el servicio `migrate` también siembra los datos base en el primer arranque.

---

## Almacenamiento de Evidencias (RustFS / S3)

Los archivos adjuntos a incidencias no se almacenan como binarios en PostgreSQL. El backend los sube a RustFS y registra solo la metadata:

| Campo | Descripción |
|:---|:---|
| `incident_id` | Incidencia relacionada |
| `original_name` | Nombre original del archivo |
| `file_path` | Ruta en el bucket S3 |
| `mime_type` | Tipo MIME validado |
| `file_size_bytes` | Tamaño en bytes |
| `file_hash` | Hash para verificación de integridad |

Para cambiar a almacenamiento local en desarrollo sin cambiar código:

```env
INCIDENT_FILESYSTEM_DISK=public
```

---

## Comandos de Referencia Rápida

```bash
# Backend
php artisan serve
php artisan migrate
php artisan migrate:fresh --seed      # Reset completo de la DB
php artisan queue:listen
php artisan reverb:start
php artisan test

# Docker (servicios de apoyo)
cd backend
docker compose -f docker.compose.yml up -d
docker compose -f docker.compose.yml down

# Frontend
cd frontend
docker compose up -d
docker compose restart frontend
docker compose down
```

---

## Notas de Desarrollo

- Si el login con Google falla por certificados cURL, revisar `curl.cainfo` en `php.ini`.
- Si Composer pide `ext-sodium`, habilitar la extensión en el `php.ini` del CLI.
- Si Redis no conecta desde Laravel local, verificar `REDIS_HOST=127.0.0.1` en `.env`.
- Si el frontend muestra una versión anterior, `Ctrl + F5` o incrementar el query string `?v=...` del recurso modificado.
- No subir credenciales reales, llaves Firebase, contraseñas ni archivos `.env`.

---

## Reglas Críticas del Proyecto

| Regla | Descripción |
|:---|:---|
| **UI esclava del backend** | No se hardcodean estados, roles, permisos ni menús. La interfaz se construye dinámicamente desde la API. |
| **Doble validación** | El frontend previene (UX). El backend valida con Policies (seguridad real). |
| **Idioma híbrido** | Código, archivos y variables en inglés. Textos de UI para el usuario en español. |
| **Sin `fetch` directo en Presentación** | Todo HTTP pasa por `core/api-client.js`. |
| **Sanitización obligatoria** | Datos externos en `innerHTML` siempre por `shared/sanitizer.js`. |
