<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clasificación de incidents en dos niveles:
 *   Categoría → Subcategoría
 *
 * Ejemplo:
 *   Vialidad → Bache, Semáforo dañado
 *   Servicios Públicos → Fuga de agua, Alumbrado
 */
return new class extends Migration
{
    public function up(): void
    {
        // ──────────────────────────────────────────────
        // core.categories — Primer nivel de clasificación
        // ──────────────────────────────────────────────
        Schema::create('core.categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('description', 255)->nullable();
            $table->string('icon', 100)->nullable()
                ->comment('Nombre del icono para el frontend (ej: fa-road)');
            $table->char('color', 7)->nullable()
                ->comment('Color hexadecimal para UI (ej: #FF5733)');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ──────────────────────────────────────────────
        // core.subcategories — Segundo nivel de clasificación
        // ──────────────────────────────────────────────
        Schema::create('core.subcategories', function (Blueprint $table) {
            $table->id();

            $table->foreignId('category_id')
                ->constrained('core.categories')
                ->cascadeOnDelete();

            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['category_id', 'name'], 'uq_subcategories_name');
            $table->index('category_id', 'idx_subcategories_category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.subcategories');
        Schema::dropIfExists('core.categories');
    }
};
