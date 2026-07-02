<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE core.territorial_units DROP CONSTRAINT IF EXISTS uq_territorial_units_parent_name');
    }

    public function down(): void
    {
        DB::statement(
            'ALTER TABLE core.territorial_units ADD CONSTRAINT uq_territorial_units_parent_name UNIQUE (parent_id, name)'
        );
    }
};
