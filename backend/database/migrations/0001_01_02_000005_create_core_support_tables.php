<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tablas de soporte del esquema core:
 *   - notificaciones: Sistema de notificaciones in-app
 *   - configuraciones: Parámetros del sistema (clave-valor tipado)
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // core.notificaciones — Notificaciones del sistema
        // ──────────────────────────────────────────────
        Schema::create('core.notifications', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('auth.users')
                ->cascadeOnDelete();

            $table->string('title', 150);
            $table->text('message');

            // El tipo usa el ENUM core.tipo_notificacion definido en la migración base
            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        // Columna ENUM (no soportada nativamente por Blueprint para tipos custom)
        DB::statement("
            ALTER TABLE core.notifications
            ADD COLUMN type core.notification_type NOT NULL DEFAULT 'STATUS_CHANGE'
        ");

        // Índice parcial: notificaciones no leídas por usuario (consulta más frecuente)
        DB::statement("
            CREATE INDEX idx_notifications_unread
            ON core.notifications (user_id)
            WHERE is_read = FALSE
        ");

        // ──────────────────────────────────────────────
        // core.configuraciones — Parámetros del sistema
        // Patrón EAV con tipo para validación
        // ──────────────────────────────────────────────
        Schema::create('core.settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique()
                ->comment('Identificador único: app.nombre, incident.codigo_prefijo, etc.');
            $table->text('value');
            $table->string('type', 20)->default('string')
                ->comment('Tipo de dato: string, integer, boolean, json');
            $table->string('description', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.settings');
        Schema::dropIfExists('core.notifications');
    }
};
