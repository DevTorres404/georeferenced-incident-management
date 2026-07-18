<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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

            // Relación polimórfica para identificar el modelo auditado (ej. App\Models\User, id: 5)
            $table->string('auditable_type', 255)->comment('Clase del modelo Eloquent afectado');
            $table->unsignedBigInteger('auditable_id')->comment('ID del registro afectado');

            // Evento (created, updated, deleted, restored, etc.)
            $table->string('event', 50)->comment('Evento que disparó la auditoría');

            $table->jsonb('old_values')->nullable()
                ->comment('Snapshot del registro ANTES del cambio');
            $table->jsonb('new_values')->nullable()
                ->comment('Snapshot del registro DESPUÉS del cambio o los datos modificados');

            $table->string('url', 255)->nullable()
                ->comment('URL/Endpoint que originó el cambio');

            $table->foreignId('user_id')->nullable()
                ->comment('Usuario que realizó la acción. NULL para sistema/crons')
                ->constrained('auth.users')
                ->nullOnDelete();

            $table->string('ip_address', 45)->nullable()
                ->comment('IPv4 o IPv6 del cliente');
            $table->text('user_agent')->nullable();

            $table->jsonb('tags')->nullable()->comment('Etiquetas opcionales de categorización');

            $table->timestamp('created_at')->useCurrent();

            // Índices de búsqueda
            $table->index(['auditable_type', 'auditable_id'], 'idx_audit_auditable');
            $table->index('user_id', 'idx_audit_user');
            $table->index('event', 'idx_audit_event');
            $table->index('created_at', 'idx_audit_created_at');
        });

        // ──────────────────────────────────────────────
        // audit.access_logs — Registro de autenticaciones
        // ──────────────────────────────────────────────
        Schema::create('audit.access_logs', function (Blueprint $table) {
            $table->id();
            $table->string('email', 255);

            $table->foreignId('user_id')->nullable()
                ->comment('Usuario relacionado al acceso, si existe')
                ->constrained('auth.users')
                ->nullOnDelete();

            $table->string('login_type', 50)->default('email')
                ->comment('email, google, 2fa, etc.');

            $table->boolean('is_success')->default(false);
            $table->string('failure_reason', 255)->nullable()
                ->comment('Razón del fallo si is_success es falso');

            $table->string('session_id', 255)->nullable()
                ->comment('ID de la sesión o token para rastreo cruzado');

            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index('email', 'idx_access_logs_email');
            $table->index('ip_address', 'idx_access_logs_ip');
            $table->index('session_id', 'idx_access_logs_session');
            $table->index('created_at', 'idx_access_logs_created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit.access_logs');
        Schema::dropIfExists('audit.audit_logs');
    }
};
