<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tablas de autenticación del esquema 'auth':
 *   - users: Usuarios del sistema (ciudadanos, operadores, supervisores, admins)
 *   - password_reset_tokens: Tokens para recuperación de contraseña
 *   - sessions: Sesiones activas del usuario
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // auth.users — Tabla principal de usuarios
        // ──────────────────────────────────────────────
        Schema::create('auth.users', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->string('email', 255)->unique();
            $table->string('password', 255);
            $table->string('phone', 20)->nullable();
            $table->string('profile_photo', 255)->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->rememberToken(); // Requerido por Laravel para "Recordarme"
            $table->timestamp('last_login')->nullable();
            $table->boolean('is_active')->default(true)
                ->comment('Desactivación temporal sin eliminar. Distinto de soft delete.');
            $table->timestamps();
            $table->softDeletes(); // deleted_at — eliminación lógica
        });

        // Índice único explícito sobre email (complementa la constraint UNIQUE)
        Schema::table('auth.users', function (Blueprint $table) {
            $table->index('email', 'idx_users_email');
            $table->index('is_active', 'idx_users_activo');
        });

        // ──────────────────────────────────────────────
        // auth.password_reset_tokens — Tokens de recuperación
        // ──────────────────────────────────────────────
        Schema::create('auth.password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        // ──────────────────────────────────────────────
        // auth.sessions — Sesiones activas
        // ──────────────────────────────────────────────
        Schema::create('auth.sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index()
                ->references('id')->on('auth.users')->nullOnDelete();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth.sessions');
        Schema::dropIfExists('auth.password_reset_tokens');
        Schema::dropIfExists('auth.users');
    }
};
