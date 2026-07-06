# Backend SGI

API REST del Sistema de Gestion de Incidencias, desarrollada en Laravel y organizada por modulos siguiendo Arquitectura Hexagonal / DDD.

## Arquitectura

El codigo principal vive en `app/` separado por contextos funcionales:

- `Auth/`: autenticacion, Google/Firebase, 2FA, roles de usuario autenticado.
- `Incidents/`: incidencias, estados, comentarios, adjuntos, asignaciones y notificaciones.
- `Catalogs/`: catalogos usados por incidencias.
- `Users/`: administracion de usuarios y roles.
- `Shared/`: contratos, DTOs, controladores base y utilidades comunes.

Cada modulo mantiene sus capas:

- `Domain/`: entidades, contratos y reglas puras del negocio.
- `Application/`: casos de uso y DTOs.
- `Infrastructure/`: controladores HTTP, repositorios Eloquent, modelos, eventos y servicios externos.

## Tests del backend

Los tests usan PHPUnit mediante `php artisan test`. La configuracion esta en `phpunit.xml`.

Por defecto el entorno de pruebas usa:

- `APP_ENV=testing`
- `DB_CONNECTION=pgsql`
- `DB_DATABASE=incident_management_system_testing`
- `DB_USERNAME=user_im`
- `DB_PASSWORD=pass_im`
- `BROADCAST_CONNECTION=null`
- `QUEUE_CONNECTION=sync`
- `CACHE_STORE=array`
- `SESSION_DRIVER=array`

Antes de ejecutar pruebas por primera vez, crea la base de datos de testing en PostgreSQL y habilita PostGIS:

```sql
CREATE DATABASE incident_management_system_testing;
\c incident_management_system_testing
CREATE EXTENSION IF NOT EXISTS postgis;
```

Luego, desde `backend/`:

```bash
composer install
php artisan config:clear
php artisan migrate:fresh --seed --env=testing
php artisan test
```

Comandos utiles:

```bash
# Ejecutar toda la suite
php artisan test

# Ejecutar solo Feature tests
php artisan test --testsuite=Feature

# Ejecutar solo Unit tests
php artisan test --testsuite=Unit

# Ejecutar un archivo especifico
php artisan test tests/Feature/IncidentsTest.php

# Detener al primer fallo
php artisan test --stop-on-failure
```

Tambien se puede usar el script de Composer:

```bash
composer test
```

## Consideraciones

- Los tests no deben depender de Reverb en ejecucion; en testing el broadcast queda en `null`.
- Los tests de incidencias deben respetar permisos y roles reales del backend.
- Si una prueba toca datos geoespaciales, debe ejecutarse contra PostgreSQL/PostGIS, no SQLite.
- No usar credenciales reales de Firebase ni valores de `.env` productivos en pruebas.

## Despliegue en Producción

Para instrucciones detalladas sobre cómo preparar y levantar el backend en un entorno de producción (VPS o servidor usando Docker Compose), por favor consulta la guía oficial de despliegue en [DEPLOY.md](./DEPLOY.md).
