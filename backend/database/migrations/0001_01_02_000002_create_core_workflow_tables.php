<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tablas de flujo de trabajo (workflow):
 *   - priorities: Niveles de urgencia con SLA en horas
 *   - states: Estados del ciclo de vida de una incident
 *   - transitions_estado: Reglas de transición válidas entre states
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // core.priorities — Niveles de urgencia
        // ──────────────────────────────────────────────
        Schema::create('core.priorities', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->smallInteger('level')->unique()
                ->comment('1=Crítica, 2=Alta, 3=Media, 4=Baja');
            $table->char('color', 7)->nullable()
                ->comment('Color hexadecimal para UI');
            $table->smallInteger('sla_hours')
                ->comment('Horas máximas para resolver según SLA');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // CHECK constraints para validar rangos
        DB::statement('ALTER TABLE core.priorities ADD CONSTRAINT chk_prioridad_nivel CHECK (level BETWEEN 1 AND 10)');
        DB::statement('ALTER TABLE core.priorities ADD CONSTRAINT chk_prioridad_sla CHECK (sla_hours > 0)');

        // ──────────────────────────────────────────────
        // core.states — Estados del ciclo de vida
        // ──────────────────────────────────────────────
        Schema::create('core.states', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique();
            $table->string('description', 255)->nullable();
            $table->char('color', 7)->nullable();
            $table->boolean('is_initial_state')->default(false)
                ->comment('Solo uno debería ser TRUE');
            $table->boolean('is_final_state')->default(false)
                ->comment('Estados terminales (cerrada, rechazada)');
            $table->boolean('allows_edition')->default(true)
                ->comment('Si la incident puede editarse en este estado');
            $table->smallInteger('order')->default(0)
                ->comment('Orden de visualización en el flujo');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Asegura que exista un solo estado inicial
        DB::statement('CREATE UNIQUE INDEX uq_estado_inicial ON core.states (is_initial_state) WHERE is_initial_state = TRUE;');

        // ──────────────────────────────────────────────
        // core.transitions_estado — Reglas de transición
        // Define qué cambios de estado son válidos y quién puede ejecutarlos
        // ──────────────────────────────────────────────
        Schema::create('core.state_transitions', function (Blueprint $table) {
            $table->id();

            $table->foreignId('source_state_id')
                ->constrained('core.states')
                ->cascadeOnDelete();

            $table->foreignId('target_state_id')
                ->constrained('core.states')
                ->cascadeOnDelete();

            $table->boolean('requires_comment')->default(false)
                ->comment('Obliga al usuario a justificar el cambio');

            $table->jsonb('allowed_roles')->nullable()
                ->comment('Array de códigos de rol: ["ADMIN","SUPERVISOR"]');

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // Una transición origen→destino solo puede existir una vez
            $table->unique(
                ['source_state_id', 'target_state_id'],
                'uq_transicion_estado'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.state_transitions');
        DB::statement('DROP INDEX IF EXISTS uq_estado_inicial;');
        Schema::dropIfExists('core.states');
        Schema::dropIfExists('core.priorities');
    }
};
