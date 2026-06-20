<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Esquema de auditoría:
 *   - audit_logs: Registro genérico de cambios (INSERT/UPDATE/DELETE) con JSONB
 *   - intentos_acceso: Registro de intentos de autenticación (exitosos y fallidos)
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // audit.audit_logs — Historial de cambios
        // ──────────────────────────────────────────────
        Schema::create('audit.audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('table_schema', 100)
                ->comment('Esquema de la tabla afectada: auth, core, audit');
            $table->string('table_name', 100)
                ->comment('Nombre de la tabla afectada');
            $table->unsignedBigInteger('table_id')
                ->comment('ID del registro afectado');

            // Columna ENUM se agrega con raw SQL abajo

            $table->jsonb('old_data')->nullable()
                ->comment('Snapshot del registro ANTES del cambio (NULL en INSERT)');
            $table->jsonb('new_data')->nullable()
                ->comment('Snapshot del registro DESPUÉS del cambio (NULL en DELETE)');

            $table->foreignId('user_id')->nullable()
                ->comment('NULL para operaciones del sistema (CRON, etc.)')
                ->constrained('auth.users')
                ->nullOnDelete();

            $table->string('ip_address', 45)->nullable()
                ->comment('IPv4 o IPv6');
            $table->text('user_agent')->nullable();

            // Columna ENUM se agrega con raw SQL abajo

            $table->timestamp('created_at')->useCurrent();
        });

        // Columnas ENUM (tipos custom de PostgreSQL)
        DB::statement("ALTER TABLE audit.audit_logs ADD COLUMN action audit.tipo_accion NOT NULL");
        DB::statement("ALTER TABLE audit.audit_logs ADD COLUMN origin audit.origen_operacion NOT NULL DEFAULT 'WEB'");

        // Índices para consultas de auditoría
        Schema::table('audit.audit_logs', function (Blueprint $table) {
            $table->index(['table_name', 'table_id'], 'idx_audit_table_record');
            $table->index('user_id', 'idx_audit_user');
            $table->index('created_at', 'idx_audit_created_at');
        });

        // ──────────────────────────────────────────────
        // audit.intentos_acceso — Registro de autenticaciones
        // Útil para detectar ataques de fuerza bruta
        // ──────────────────────────────────────────────
        Schema::create('audit.access_logs', function (Blueprint $table) {
            $table->id();
            $table->string('email', 255);

            $table->foreignId('user_id')->nullable()
                ->comment('NULL si el email no corresponde a un usuario registrado')
                ->constrained('auth.users')
                ->nullOnDelete();

            $table->boolean('is_success')->default(false);
            $table->string('failure_reason', 255)->nullable()
                ->comment('Ej: credenciales_invalidas, cuenta_bloqueada, etc.');

            $table->string('ip_address', 45);
            $table->text('user_agent')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('email', 'idx_access_logs_email');
            $table->index('ip_address', 'idx_access_logs_ip');
            $table->index('created_at', 'idx_access_logs_created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit.access_logs');
        Schema::dropIfExists('audit.audit_logs');
    }
};
