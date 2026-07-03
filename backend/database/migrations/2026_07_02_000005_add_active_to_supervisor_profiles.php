<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auth.supervisor_profiles', function (Blueprint $table) {
            $table->boolean('active')->default(true)->after('max_operators');
        });

        DB::table('auth.supervisor_profiles')->update([
            'active' => true,
        ]);
    }

    public function down(): void
    {
        Schema::table('auth.supervisor_profiles', function (Blueprint $table) {
            $table->dropColumn('active');
        });
    }
};
