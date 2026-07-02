# Comandos Útiles de PHP Artisan

Esta guía contiene los comandos de `php artisan` más utilizados durante el desarrollo del backend del SGI. Todos estos comandos deben ejecutarse desde dentro de la carpeta `backend/`.

## Servidor de Desarrollo

- `php artisan serve` - Inicia el servidor de desarrollo local en `http://127.0.0.1:8000`.

## Base de Datos y Migraciones

- `php artisan migrate` - Ejecuta todas las migraciones pendientes.
- `php artisan migrate:rollback` - Revierte el último lote de migraciones.
- `php artisan db:seed` - Ejecuta los seeders para poblar la base de datos con datos iniciales.
- `php artisan migrate:fresh --seed` - **(Peligroso en Producción)** Borra todas las tablas de la base de datos, vuelve a correr las migraciones y ejecuta los seeders. Muy útil para reiniciar por completo la BD en desarrollo local.

## Colas y Websockets (Reverb)

- `php artisan queue:listen` - Escucha y procesa los trabajos (jobs) encolados (se actualiza automáticamente ante cambios de código).
- `php artisan queue:work` - Procesa los trabajos encolados (tiene mejor rendimiento pero requiere reiniciar el comando si hay cambios en el código de los jobs).
- `php artisan reverb:start` - Inicia el servidor de WebSockets de Laravel Reverb para comunicación y eventos en tiempo real.

## Limpieza de Caché y Configuración

- `php artisan optimize:clear` - Limpia toda la caché del sistema (vistas, rutas, configuración, eventos). Útil cuando hay problemas de configuración "pegada" y cambios que no se reflejan.
- `php artisan config:clear` - Limpia exclusivamente la caché de configuración.
- `php artisan route:clear` - Limpia la caché de rutas.
- `php artisan view:clear` - Limpia la caché de vistas (Blade).
- `php artisan cache:clear` - Limpia la caché general de la aplicación.

## Generación de Claves

- `php artisan key:generate` - Genera una nueva clave `APP_KEY` para el archivo `.env`. (Generalmente solo necesario la primera vez que se clona/instala el proyecto).

## Logs e Información

- `php artisan pail` - Observa los logs de la aplicación de forma interactiva y legible en la terminal.
- `php artisan about` - Muestra un resumen del estado y la configuración del entorno actual de la aplicación.
- `php artisan route:list` - Muestra una tabla con la lista detallada de todas las rutas (endpoints) registradas en la aplicación.

## Generación de Código (Make)

Aunque el backend utiliza una estructura de Arquitectura Hexagonal/DDD, estos comandos siguen siendo útiles para generar las bases:
- `php artisan make:migration create_nombre_tabla_table` - Crea un archivo de migración vacío para base de datos.
- `php artisan make:seeder NombreSeeder` - Crea un nuevo seeder.
- `php artisan make:test NombreTest` - Crea una prueba (Feature o Unit) para testing.

> **⚠️ Importante:** Dado que la arquitectura está modularizada (ej. `app/Incidents/`), si usas comandos como `php artisan make:model` o `php artisan make:controller`, Laravel los creará en las carpetas por defecto (`app/Models` o `app/Http/Controllers`). Deberás mover esos archivos manualmente a su módulo correspondiente (Capa de Infraestructura) y ajustar los `namespaces`.

## Testing

- `php artisan test` - Ejecuta todas las pruebas automatizadas del backend.
- `php artisan test --testsuite=Feature` - Ejecuta solo pruebas de integracion/API.
- `php artisan test --testsuite=Unit` - Ejecuta solo pruebas unitarias.
- `php artisan test tests/Feature/IncidentsTest.php` - Ejecuta un archivo de pruebas especifico.
- `php artisan test --stop-on-failure` - Detiene la ejecucion en el primer fallo.

Antes de correr pruebas por primera vez, verifica que exista la base `incident_management_system_testing` en PostgreSQL con PostGIS habilitado. La configuracion se toma desde `backend/phpunit.xml`.

```sql
CREATE DATABASE incident_management_system_testing;
\c incident_management_system_testing
CREATE EXTENSION IF NOT EXISTS postgis;
```

Flujo recomendado desde `backend/`:

```bash
php artisan config:clear
php artisan migrate:fresh --seed --env=testing
php artisan test
```