<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth.user_territories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('auth.users')->cascadeOnDelete();
            $table->foreignId('territorial_unit_id')->constrained('core.territorial_units')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('auth.users')->nullOnDelete();
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamp('unassigned_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['user_id', 'is_active'], 'idx_user_territories_user_active');
            $table->index(['territorial_unit_id', 'is_active'], 'idx_user_territories_territory_active');
        });

        Schema::create('auth.supervisor_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('auth.users')->cascadeOnDelete();
            $table->unsignedSmallInteger('max_operators')->default(5);
            $table->timestamps();
        });

        Schema::create('auth.operator_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('auth.users')->cascadeOnDelete();
            $table->unsignedInteger('incident_capacity')->default(20);
            $table->timestamps();
        });

        Schema::create('auth.supervisor_operator_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supervisor_user_id')->constrained('auth.users')->cascadeOnDelete();
            $table->foreignId('operator_user_id')->constrained('auth.users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('auth.users')->nullOnDelete();
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamp('unassigned_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['supervisor_user_id', 'is_active'], 'idx_sup_op_assign_supervisor_active');
            $table->index(['operator_user_id', 'is_active'], 'idx_sup_op_assign_operator_active');
        });

        DB::statement('ALTER TABLE auth.supervisor_profiles ADD CONSTRAINT chk_supervisor_profiles_max_operators CHECK (max_operators > 0)');
        DB::statement('ALTER TABLE auth.operator_profiles ADD CONSTRAINT chk_operator_profiles_incident_capacity CHECK (incident_capacity > 0)');
        DB::statement('CREATE UNIQUE INDEX uq_user_territories_active_user ON auth.user_territories (user_id) WHERE is_active = true');
        DB::statement('CREATE UNIQUE INDEX uq_user_territories_active_pair ON auth.user_territories (user_id, territorial_unit_id) WHERE is_active = true');
        DB::statement('CREATE UNIQUE INDEX uq_sup_op_assignments_active_operator ON auth.supervisor_operator_assignments (operator_user_id) WHERE is_active = true');
        DB::statement('CREATE UNIQUE INDEX uq_sup_op_assignments_active_pair ON auth.supervisor_operator_assignments (supervisor_user_id, operator_user_id) WHERE is_active = true');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS auth.uq_sup_op_assignments_active_pair');
        DB::statement('DROP INDEX IF EXISTS auth.uq_sup_op_assignments_active_operator');
        DB::statement('DROP INDEX IF EXISTS auth.uq_user_territories_active_pair');
        DB::statement('DROP INDEX IF EXISTS auth.uq_user_territories_active_user');
        DB::statement('ALTER TABLE auth.operator_profiles DROP CONSTRAINT IF EXISTS chk_operator_profiles_incident_capacity');
        DB::statement('ALTER TABLE auth.supervisor_profiles DROP CONSTRAINT IF EXISTS chk_supervisor_profiles_max_operators');

        Schema::dropIfExists('auth.supervisor_operator_assignments');
        Schema::dropIfExists('auth.operator_profiles');
        Schema::dropIfExists('auth.supervisor_profiles');
        Schema::dropIfExists('auth.user_territories');
    }
};
