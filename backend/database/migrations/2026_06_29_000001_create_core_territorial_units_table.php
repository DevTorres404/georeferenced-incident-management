<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core.territorial_units', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('type', 20);
            $table->foreignId('parent_id')->nullable()
                ->constrained('core.territorial_units')
                ->nullOnDelete();
            $table->string('code', 60)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('parent_id', 'idx_territorial_units_parent');
            $table->index('type', 'idx_territorial_units_type');
            $table->index('is_active', 'idx_territorial_units_active');
            $table->unique('code', 'uq_territorial_units_code');
        });

        DB::statement("ALTER TABLE core.territorial_units ADD CONSTRAINT chk_territorial_units_type CHECK (type IN ('province', 'canton', 'parish', 'sector'))");
        DB::statement("CREATE UNIQUE INDEX uq_territorial_units_root_name ON core.territorial_units (name) WHERE parent_id IS NULL");
    }

    public function down(): void
    {
        Schema::dropIfExists('core.territorial_units');
    }
};
