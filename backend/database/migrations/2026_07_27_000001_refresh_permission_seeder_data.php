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
        // Borrar los registros antiguos de permisos de roles
        DB::table('auth.permission_role')->truncate();

        // Correr el PermissionSeeder actualizado
        Artisan::call('db:seed', [
            '--class' => 'PermissionSeeder',
            '--force' => true
        ]);
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
