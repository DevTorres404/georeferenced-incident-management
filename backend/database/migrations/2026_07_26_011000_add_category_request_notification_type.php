<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TYPE core.notification_type ADD VALUE IF NOT EXISTS 'CATEGORY_REQUEST'");
    }

    public function down(): void
    {
        // PostgreSQL does not safely support removing an enum value in place.
    }
};
