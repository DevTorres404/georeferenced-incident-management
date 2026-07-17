<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->unsignedBigInteger('current_cycle_id')->nullable()->after('resolved_by_supervisor_id');

            $table->foreign('current_cycle_id')
                ->references('id')
                ->on('core.incident_cycles')
                ->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropForeign(['current_cycle_id']);
            $table->dropColumn('current_cycle_id');
        });
    }
};
