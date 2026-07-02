<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('core.incidents', 'city_id')) {
            DB::statement('ALTER TABLE core.incidents ALTER COLUMN city_id DROP NOT NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('core.incidents', 'city_id')) {
            DB::statement('ALTER TABLE core.incidents ALTER COLUMN city_id SET NOT NULL');
        }
    }
};
