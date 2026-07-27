<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $role = \App\Auth\Infrastructure\Persistence\Models\Role::where('code', 'ADMIN')->first();
        if ($role) {
            $permissions = \App\Auth\Infrastructure\Persistence\Models\Permission::whereNotIn('code', [
                'incidents.create',
                'incidents.edit',
                'incidents.delete',
                'incidents.assign',
                'incidents.close',
                'incidents.reopen',
                'comments.create',
                'comments.internal',
                'operations.view_team',
            ])->pluck('id');
            
            $role->permissions()->sync($permissions);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No hay vuelta atras segura para un seeder dinámico, 
        // pero podemos dejarlo vacío o volver a correrlo.
    }
};
