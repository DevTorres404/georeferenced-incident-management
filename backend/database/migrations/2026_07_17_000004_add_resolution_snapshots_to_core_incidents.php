<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->jsonb('resolution_snapshots')->nullable()->after('resolved_by_supervisor_id');
        });
    }

    public function down(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropColumn('resolution_snapshots');
        });
    }
};
