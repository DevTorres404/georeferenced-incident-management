<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE core.territorial_units DROP CONSTRAINT IF EXISTS chk_territorial_units_type');
        DB::statement("ALTER TABLE core.territorial_units ADD CONSTRAINT chk_territorial_units_type CHECK (type IN ('country', 'operational_zone', 'province', 'canton', 'parish', 'sector'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE core.territorial_units DROP CONSTRAINT IF EXISTS chk_territorial_units_type');
        DB::statement("ALTER TABLE core.territorial_units ADD CONSTRAINT chk_territorial_units_type CHECK (type IN ('province', 'canton', 'parish', 'sector'))");
    }
};
