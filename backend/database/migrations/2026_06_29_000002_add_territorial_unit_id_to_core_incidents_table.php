<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->foreignId('territorial_unit_id')
                ->nullable()
                ->after('state_id')
                ->constrained('core.territorial_units')
                ->nullOnDelete();

            $table->index('territorial_unit_id', 'idx_incidents_territorial_unit');
        });
    }

    public function down(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropForeign(['territorial_unit_id']);
            $table->dropIndex('idx_incidents_territorial_unit');
            $table->dropColumn('territorial_unit_id');
        });
    }
};
