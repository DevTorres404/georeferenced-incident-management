<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.territorial_units', function (Blueprint $table) {
            if (Schema::hasColumn('core.territorial_units', 'latitude')) {
                $table->dropColumn('latitude');
            }

            if (Schema::hasColumn('core.territorial_units', 'longitude')) {
                $table->dropColumn('longitude');
            }
        });
    }

    public function down(): void
    {
        Schema::table('core.territorial_units', function (Blueprint $table) {
            if (! Schema::hasColumn('core.territorial_units', 'latitude')) {
                $table->decimal('latitude', 10, 8)->nullable();
            }

            if (! Schema::hasColumn('core.territorial_units', 'longitude')) {
                $table->decimal('longitude', 11, 8)->nullable();
            }
        });
    }
};
