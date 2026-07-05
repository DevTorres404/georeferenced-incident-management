<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('pgsql')->table('core.notifications', function (Blueprint $table) {
            $table->unsignedBigInteger('incident_id')->nullable()->after('user_id');
            $table->foreign('incident_id')->references('id')->on('core.incidents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::connection('pgsql')->table('core.notifications', function (Blueprint $table) {
            $table->dropForeign(['incident_id']);
            $table->dropColumn('incident_id');
        });
    }
};
