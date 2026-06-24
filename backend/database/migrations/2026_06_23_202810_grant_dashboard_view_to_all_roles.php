<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $permission = DB::table('auth.permissions')->where('code', 'dashboard.view')->first();
        if (!$permission) return;

        $roles = DB::table('auth.roles')->get();
        foreach ($roles as $role) {
            $exists = DB::table('auth.permission_role')
                ->where('role_id', $role->id)
                ->where('permission_id', $permission->id)
                ->exists();

            if (!$exists) {
                DB::table('auth.permission_role')->insert([
                    'role_id' => $role->id,
                    'permission_id' => $permission->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No down migration needed for granting
    }
};
