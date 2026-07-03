<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE core.territorial_units ADD COLUMN coverage_area geometry(MultiPolygon, 4326)');
        DB::statement('CREATE INDEX idx_territorial_units_coverage_area ON core.territorial_units USING GIST (coverage_area)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS core.idx_territorial_units_coverage_area');

        if (Schema::hasColumn('core.territorial_units', 'coverage_area')) {
            DB::statement('ALTER TABLE core.territorial_units DROP COLUMN coverage_area');
        }
    }
};
