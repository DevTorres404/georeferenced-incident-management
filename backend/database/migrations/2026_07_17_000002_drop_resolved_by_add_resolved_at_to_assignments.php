<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropForeign(['resolved_by_id']);
            $table->dropColumn('resolved_by_id');
        });

        Schema::table('core.incident_assignments', function (Blueprint $table) {
            $table->timestamp('resolved_at')->nullable()->after('unassignment_date');
        });
    }

    public function down(): void
    {
        Schema::table('core.incident_assignments', function (Blueprint $table) {
            $table->dropColumn('resolved_at');
        });

        Schema::table('core.incidents', function (Blueprint $table) {
            $table->unsignedBigInteger('resolved_by_id')->nullable()->after('rejected_at');
            $table->foreign('resolved_by_id')
                ->references('id')
                ->on('auth.users')
                ->nullOnDelete();
        });
    }
};
