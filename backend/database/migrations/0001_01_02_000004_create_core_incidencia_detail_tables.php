<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tablas de detalle vinculadas a incidents:
 *   - incident_states: Historial completo de cambios de estado
 *   - incident_asignaciones: Historial de asignaciones a operadores
 *   - incident_addCommentios: Comentarios públicos e internos
 *   - incident_adjuntos: Archivos adjuntos con hash de integridad
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // core.incident_states — Historial de states
        // Tabla append-only: nunca se actualiza, solo se insertan registros
        // ──────────────────────────────────────────────
        Schema::create('core.incident_states', function (Blueprint $table) {
            $table->id();

            $table->foreignId('incident_id')
                ->constrained('core.incidents')
                ->cascadeOnDelete();

            $table->foreignId('previous_state_id')->nullable()
                ->comment('NULL para el primer estado (creación)')
                ->constrained('core.states');

            $table->foreignId('new_state_id')
                ->constrained('core.states');

            $table->foreignId('user_id')
                ->comment('Quién realizó el cambio de estado')
                ->constrained('auth.users');

            $table->text('comment')->nullable()
                ->comment('Justificación del cambio (obligatorio en algunas transitions)');

            $table->timestamp('created_at')->useCurrent();

            // Índice compuesto para consultar el historial cronológico
            $table->index(
                ['incident_id', 'created_at'],
                'idx_inc_states_timeline'
            );
        });

        // ──────────────────────────────────────────────
        // core.incident_asignaciones — Historial de asignaciones
        // El campo asignado_actual_id en incidents se sincroniza por trigger
        // ──────────────────────────────────────────────
        Schema::create('core.incident_assignments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('incident_id')
                ->constrained('core.incidents')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->comment('Operador/técnico asignado')
                ->constrained('auth.users');

            $table->foreignId('assigned_by_id')
                ->comment('Supervisor que realizó la asignación')
                ->constrained('auth.users');

            $table->timestamp('assignment_date')->useCurrent();

            $table->timestamp('unassignment_date')->nullable()
                ->comment('Se establece automáticamente por trigger al reassign');

            $table->timestamps();

            $table->index('incident_id', 'idx_inc_assignments_incident');
            $table->index('user_id', 'idx_inc_assignments_user');
        });

        // ──────────────────────────────────────────────
        // core.incident_addCommentios — Comunicación
        // ──────────────────────────────────────────────
        Schema::create('core.incident_comments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('incident_id')
                ->constrained('core.incidents')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('auth.users');

            $table->text('comment');

            $table->boolean('is_internal')->default(false)
                ->comment('TRUE = solo visible para operadores/supervisores');

            $table->timestamps();

            $table->index(
                ['incident_id', 'created_at'],
                'idx_inc_comments_timeline'
            );
        });

        // ──────────────────────────────────────────────
        // core.incident_adjuntos — Archivos adjuntos
        // Tabla append-only: los adjuntos no se modifican
        // ──────────────────────────────────────────────
        Schema::create('core.incident_attachments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('incident_id')
                ->constrained('core.incidents')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('auth.users');

            $table->string('original_name', 255)
                ->comment('Nombre del file tal como lo subió el usuario');

            $table->string('file_path', 500)
                ->comment('Ruta en el sistema de archivos (storage)');

            $table->string('mime_type', 100);

            $table->bigInteger('file_size_bytes')->unsigned();

            $table->string('file_hash', 255)->nullable()
                ->comment('SHA-256 para verificación de integridad');

            $table->timestamp('created_at')->useCurrent();

            $table->index('incident_id', 'idx_inc_attachments_incident');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.incident_attachments');
        Schema::dropIfExists('core.incident_comments');
        Schema::dropIfExists('core.incident_assignments');
        Schema::dropIfExists('core.incident_states');
    }
};
