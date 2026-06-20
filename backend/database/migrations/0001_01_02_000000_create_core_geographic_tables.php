<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jerarquía geográfica para ubicación de incidents:
 *   País → Province/Departamento → City/Municipio
 *
 * Todas las tablas incluyen campo 'activo' para desactivación
 * sin eliminación (los registros históricos siguen referenciándolas).
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // core.countries
        // ──────────────────────────────────────────────
        Schema::create('core.countries', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->char('iso_code', 2)->unique()
                ->comment('Código ISO 3166-1 alfa-2 (ej: EC, CO, MX)');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ──────────────────────────────────────────────
        // core.provinces — Segundo nivel geográfico
        // ──────────────────────────────────────────────
        Schema::create('core.provinces', function (Blueprint $table) {
            $table->id();

            $table->foreignId('country_id')
                ->constrained('core.countries')
                ->cascadeOnDelete();

            $table->string('name', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('country_id', 'idx_provinces_country');
        });

        // ──────────────────────────────────────────────
        // core.cities — Tercer nivel geográfico
        // ──────────────────────────────────────────────
        Schema::create('core.cities', function (Blueprint $table) {
            $table->id();

            $table->foreignId('province_id')
                ->constrained('core.provinces')
                ->cascadeOnDelete();

            $table->string('name', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('province_id', 'idx_cities_province');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.cities');
        Schema::dropIfExists('core.provinces');
        Schema::dropIfExists('core.countries');
    }
};
