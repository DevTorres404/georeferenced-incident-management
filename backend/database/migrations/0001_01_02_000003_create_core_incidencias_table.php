<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * core.incidents — Tabla principal del sistema.
 *
 * Almacena los reportes ciudadanos con:
 *   - Clasificación (categoría, subcategoría, prioridad, estado)
 *   - Ubicación geográfica (unidad territorial + coordenadas + geometría PostGIS)
 *   - Trazabilidad (quién reportó, quién está asignado, SLA)
 *   - Soft delete para eliminación lógica
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core.incidents', function (Blueprint $table) {
            $table->id();

            $table->string('code', 20)->unique()
                ->comment('Código legible único: INC-2026-00001');

            $table->string('title', 200);
            $table->text('description');

            // ── Clasificación ──
            $table->foreignId('category_id')
                ->constrained('core.categories');

            $table->foreignId('subcategory_id')->nullable()
                ->comment('Opcional: no todas las categorías tienen subcategorías')
                ->constrained('core.subcategories')
                ->nullOnDelete();

            $table->foreignId('priority_id')
                ->constrained('core.priorities');

            $table->foreignId('state_id')
                ->constrained('core.states');

            // ── Ubicación ──
            $table->string('address', 255)->nullable();

            $table->decimal('latitude', 10, 8)->nullable()
                ->comment('Coordenada geográfica: -90 a 90');

            $table->decimal('longitude', 11, 8)->nullable()
                ->comment('Coordenada geográfica: -180 a 180');

            // ── Trazabilidad ──
            $table->foreignId('reported_by_id')
                ->comment('Ciudadano que creó la incident')
                ->constrained('auth.users');

            $table->foreignId('current_assigned_id')->nullable()
                ->comment('Campo desnormalizado — sincronizado por trigger desde incident_asignaciones')
                ->constrained('auth.users')
                ->nullOnDelete();

            // ── SLA ──
            $table->timestamp('due_date')->nullable()
                ->comment('Calculada automáticamente por trigger: created_at + prioridad.sla_horas');

            $table->timestamp('resolution_date')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });

        // ── Columna PostGIS (no soportada por Blueprint) ──
        DB::statement("
            ALTER TABLE core.incidents
            ADD COLUMN location geometry(Point, 4326)
        ");

        // ── CHECK constraints de coordenadas ──
        DB::statement('ALTER TABLE core.incidents ADD CONSTRAINT chk_incident_latitude CHECK (latitude BETWEEN -90 AND 90)');
        DB::statement('ALTER TABLE core.incidents ADD CONSTRAINT chk_incident_longitude CHECK (longitude BETWEEN -180 AND 180)');

        // ── Índices de rendimiento ──
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->index('code', 'idx_incidents_code');
            $table->index('state_id', 'idx_incidents_state');
            $table->index('priority_id', 'idx_incidents_priority');
            $table->index('reported_by_id', 'idx_incidents_reported_by');
            $table->index('current_assigned_id', 'idx_incidents_assigned');
            $table->index('created_at', 'idx_incidents_created_at');
        });

        // ── Índice espacial PostGIS (GIST) para consultas geográficas ──
        DB::statement('CREATE INDEX idx_incidents_location ON core.incidents USING GIST (location)');

        // ── Índice parcial: solo incidents activas (sin soft delete) ──
        DB::statement('CREATE INDEX idx_incidents_active ON core.incidents (state_id, priority_id) WHERE deleted_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('core.incidents');
    }
};
