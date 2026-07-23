<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const FALLBACK_CATEGORY_ID = 9_000_000_000;

    public function up(): void
    {
        Schema::table('core.categories', function (Blueprint $table) {
            $table->boolean('is_fallback')->default(false);
        });

        DB::statement(
            'CREATE UNIQUE INDEX uq_categories_single_fallback
             ON core.categories (is_fallback)
             WHERE is_fallback = true'
        );

        $existingFallbackId = DB::table('core.categories')
            ->where('name', 'Sin clasificar')
            ->value('id');
        $fallbackValues = [
            'description' => 'Clasificación temporal para incidencias que no están cubiertas por el catálogo.',
            'icon' => 'fa-circle-question',
            'color' => '#6B7280',
            'is_active' => true,
            'is_fallback' => true,
            'updated_at' => now(),
        ];

        if ($existingFallbackId) {
            DB::table('core.categories')
                ->where('id', $existingFallbackId)
                ->update($fallbackValues);
        } else {
            DB::table('core.categories')->insert([
                'id' => self::FALLBACK_CATEGORY_ID,
                'name' => 'Sin clasificar',
                'description' => 'Clasificación temporal para incidencias que no están cubiertas por el catálogo.',
                'icon' => 'fa-circle-question',
                'color' => '#6B7280',
                'is_active' => true,
                'is_fallback' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        $fallbackId = (int) DB::table('core.categories')
            ->where('is_fallback', true)
            ->value('id');

        Schema::table('core.incidents', function (Blueprint $table) {
            $table->string('classification_status', 20)->default('CLASSIFIED');
            $table->text('classification_detail')->nullable();
            $table->foreignId('classified_by')->nullable()
                ->constrained('auth.users')
                ->nullOnDelete();
            $table->timestamp('classified_at')->nullable();
            $table->index('classification_status', 'idx_incidents_classification_status');
        });

        DB::statement(
            "ALTER TABLE core.incidents
             ADD CONSTRAINT chk_incident_classification_status
             CHECK (classification_status IN ('PENDING', 'CLASSIFIED'))"
        );

        Schema::create('core.incident_classification_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('core.incidents')->cascadeOnDelete();
            $table->foreignId('previous_category_id')->nullable()->constrained('core.categories')->nullOnDelete();
            $table->foreignId('previous_subcategory_id')->nullable()->constrained('core.subcategories')->nullOnDelete();
            $table->foreignId('new_category_id')->constrained('core.categories');
            $table->foreignId('new_subcategory_id')->nullable()->constrained('core.subcategories')->nullOnDelete();
            $table->foreignId('changed_by')->constrained('auth.users');
            $table->text('reason');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['incident_id', 'created_at'], 'idx_incident_classification_history');
        });

        DB::table('core.incidents')
            ->where('category_id', $fallbackId)
            ->update(['classification_status' => 'PENDING']);
    }

    public function down(): void
    {
        Schema::dropIfExists('core.incident_classification_history');

        DB::statement('ALTER TABLE core.incidents DROP CONSTRAINT IF EXISTS chk_incident_classification_status');

        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropIndex('idx_incidents_classification_status');
            $table->dropForeign(['classified_by']);
            $table->dropColumn([
                'classification_status',
                'classification_detail',
                'classified_by',
                'classified_at',
            ]);
        });

        DB::statement('DROP INDEX IF EXISTS core.uq_categories_single_fallback');
        $fallbackId = DB::table('core.categories')->where('is_fallback', true)->value('id');
        $replacementId = DB::table('core.categories')
            ->where('is_fallback', false)
            ->orderBy('id')
            ->value('id');
        if ($fallbackId && $replacementId) {
            DB::table('core.incidents')
                ->where('category_id', $fallbackId)
                ->update(['category_id' => $replacementId]);
        }
        DB::table('core.categories')->where('is_fallback', true)->delete();

        Schema::table('core.categories', function (Blueprint $table) {
            $table->dropColumn('is_fallback');
        });
    }
};
