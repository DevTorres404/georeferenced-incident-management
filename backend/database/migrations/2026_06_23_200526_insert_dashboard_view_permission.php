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
        DB::table('auth.permissions')->insert([
            'code' => 'dashboard.view',
            'name' => 'Ver Dashboard',
            'description' => 'Permite visualizar el panel principal (dashboard).',
            'module' => 'Dashboard',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        
        $adminRole = DB::table('auth.roles')->where('code', 'ADMIN')->first();
        if ($adminRole) {
            $permission = DB::table('auth.permissions')->where('code', 'dashboard.view')->first();
            DB::table('auth.permission_role')->insert([
                'role_id' => $adminRole->id,
                'permission_id' => $permission->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $permission = DB::table('auth.permissions')->where('code', 'dashboard.view')->first();
        if ($permission) {
            DB::table('auth.permission_role')->where('permission_id', $permission->id)->delete();
            DB::table('auth.permissions')->where('id', $permission->id)->delete();
        }
    }
};
