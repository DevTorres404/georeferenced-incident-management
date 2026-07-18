<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Legacy migration kept to preserve migration order.
        // Territorial hierarchy now lives in core.territorial_units.
    }

    public function down(): void {}
};
