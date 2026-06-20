<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migración base: crea los esquemas de PostgreSQL, extensiones
 * y tipos ENUM necesarios para toda la aplicación.
 *
 * Esquemas:
 *   - auth:  Seguridad, autenticación y autorización
 *   - core:  Lógica de negocio (incidents, catálogos, etc.)
 *   - audit: Auditoría e historial de cambios
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // Esquemas de la base de datos
        // ──────────────────────────────────────────────
        DB::statement('CREATE SCHEMA IF NOT EXISTS auth');
        DB::statement('CREATE SCHEMA IF NOT EXISTS core');
        DB::statement('CREATE SCHEMA IF NOT EXISTS audit');

        // ──────────────────────────────────────────────
        // Extensiones de PostgreSQL
        // ──────────────────────────────────────────────
        // PostGIS: soporte para datos geoespaciales (puntos, polígonos, etc.)
        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');

        // ──────────────────────────────────────────────
        // Tipos ENUM — Notificaciones
        // ──────────────────────────────────────────────
        DB::statement("
            DO $$ BEGIN
                CREATE TYPE core.notification_type AS ENUM (
                    'INCIDENT_ASSIGNED',
                    'INCIDENT_CLOSED',
                    'NEW_COMMENT',
                    'STATUS_CHANGE',
                    'INCIDENT_OVERDUE'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        ");

        // ──────────────────────────────────────────────
        // Tipos ENUM — Auditoría
        // ──────────────────────────────────────────────
        DB::statement("
            DO $$ BEGIN
                CREATE TYPE audit.tipo_accion AS ENUM (
                    'INSERT',
                    'UPDATE',
                    'DELETE'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        ");

        DB::statement("
            DO $$ BEGIN
                CREATE TYPE audit.origen_operacion AS ENUM (
                    'WEB',
                    'API',
                    'SYSTEM',
                    'CRON'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TYPE IF EXISTS audit.origen_operacion');
        DB::statement('DROP TYPE IF EXISTS audit.tipo_accion');
        DB::statement('DROP TYPE IF EXISTS core.notification_type');
        DB::statement('DROP EXTENSION IF EXISTS postgis CASCADE');
        DB::statement('DROP SCHEMA IF EXISTS audit CASCADE');
        DB::statement('DROP SCHEMA IF EXISTS core CASCADE');
        DB::statement('DROP SCHEMA IF EXISTS auth CASCADE');
    }
};
