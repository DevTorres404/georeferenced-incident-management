<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sistema RBAC (Role-Based Access Control):
 *   - roles: Roles del sistema (ADMIN, SUPERVISOR, OPERADOR, CIUDADANO)
 *   - permissions: Permisos granulares agrupados por módulo
 *   - role_user: Pivote usuario ↔ rol (con metadatos de asignación)
 *   - permission_role: Pivote permiso ↔ rol
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // auth.roles — Roles del sistema
        // ──────────────────────────────────────────────
        Schema::create('auth.roles', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique()
                ->comment('Identificador interno: ADMIN, SUPERVISOR, etc.');
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ──────────────────────────────────────────────
        // auth.permissions — Permisos granulares
        // ──────────────────────────────────────────────
        Schema::create('auth.permissions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique()
                ->comment('Formato: modulo.accion (ej: incidents.crear)');
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->string('module', 50)
                ->comment('Agrupación lógica: incidents, usuarios, reportes, etc.');
            $table->timestamps();

            $table->index('module', 'idx_permissions_modulo');
        });

        // ──────────────────────────────────────────────
        // auth.role_user — Asignación de roles a usuarios
        // Incluye trazabilidad: quién asignó y cuándo
        // ──────────────────────────────────────────────
        Schema::create('auth.role_user', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('auth.users')
                ->cascadeOnDelete();

            $table->foreignId('role_id')
                ->constrained('auth.roles')
                ->cascadeOnDelete();

            $table->foreignId('assigned_by')->nullable()
                ->comment('Usuario que realizó la asignación')
                ->constrained('auth.users')
                ->nullOnDelete();

            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamps();

            // Un usuario no puede tener el mismo rol duplicado
            $table->unique(['user_id', 'role_id'], 'uq_role_user');
        });

        // ──────────────────────────────────────────────
        // auth.permission_role — Asignación de permissions a roles
        // ──────────────────────────────────────────────
        Schema::create('auth.permission_role', function (Blueprint $table) {
            $table->id();

            $table->foreignId('permission_id')
                ->constrained('auth.permissions')
                ->cascadeOnDelete();

            $table->foreignId('role_id')
                ->constrained('auth.roles')
                ->cascadeOnDelete();

            $table->timestamps();

            // Un permiso no puede assignse dos veces al mismo rol
            $table->unique(['permission_id', 'role_id'], 'uq_permission_role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth.permission_role');
        Schema::dropIfExists('auth.role_user');
        Schema::dropIfExists('auth.permissions');
        Schema::dropIfExists('auth.roles');
    }
};
