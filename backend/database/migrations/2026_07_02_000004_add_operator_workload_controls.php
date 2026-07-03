<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.priorities', function (Blueprint $table) {
            $table->unsignedSmallInteger('weight')->default(1)->after('sla_hours');
        });

        Schema::table('auth.operator_profiles', function (Blueprint $table) {
            $table->unsignedSmallInteger('max_active_incidents')->default(10)->after('incident_capacity');
            $table->unsignedSmallInteger('max_workload_points')->default(20)->after('max_active_incidents');
            $table->boolean('active')->default(true)->after('max_workload_points');
        });

        DB::statement('ALTER TABLE core.priorities ADD CONSTRAINT chk_priorities_weight CHECK (weight > 0)');
        DB::statement('ALTER TABLE auth.operator_profiles ADD CONSTRAINT chk_operator_profiles_max_active_incidents CHECK (max_active_incidents > 0)');
        DB::statement('ALTER TABLE auth.operator_profiles ADD CONSTRAINT chk_operator_profiles_max_workload_points CHECK (max_workload_points > 0)');

        DB::table('core.priorities')->where('level', 1)->update(['weight' => 5]);
        DB::table('core.priorities')->where('level', 2)->update(['weight' => 3]);
        DB::table('core.priorities')->where('level', 3)->update(['weight' => 2]);
        DB::table('core.priorities')->where('level', 4)->update(['weight' => 1]);

        DB::table('auth.operator_profiles')->update([
            'max_active_incidents' => 10,
            'max_workload_points' => 20,
            'active' => true,
        ]);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE auth.operator_profiles DROP CONSTRAINT IF EXISTS chk_operator_profiles_max_workload_points');
        DB::statement('ALTER TABLE auth.operator_profiles DROP CONSTRAINT IF EXISTS chk_operator_profiles_max_active_incidents');
        DB::statement('ALTER TABLE core.priorities DROP CONSTRAINT IF EXISTS chk_priorities_weight');

        Schema::table('auth.operator_profiles', function (Blueprint $table) {
            $table->dropColumn(['max_active_incidents', 'max_workload_points', 'active']);
        });

        Schema::table('core.priorities', function (Blueprint $table) {
            $table->dropColumn('weight');
        });
    }
};
