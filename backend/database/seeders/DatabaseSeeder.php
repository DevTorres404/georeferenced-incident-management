<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Seeder principal — Orquesta la ejecución de todos los seeders
 * en el orden correcto respetando dependencias entre tablas.
 *
 * Ejecución: php artisan db:seed
 *            php artisan migrate --seed
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // ──────────────────────────────────────────────
        // 1. Auth: Roles y Permisos (sin dependencias)
        // ──────────────────────────────────────────────
        $this->call(RoleSeeder::class);
        $this->call(PermissionSeeder::class);

        // ──────────────────────────────────────────────
        // 2. Core: Catálogos base
        // ──────────────────────────────────────────────
        $this->call(StateSeeder::class);
        $this->call(PrioritySeeder::class);
        $this->call(CategorySeeder::class);
        $this->call(CountrySeeder::class);
        $this->call(ConfigurationSeeder::class);

        // ──────────────────────────────────────────────
        // 3. Usuario administrador por defecto
        // ──────────────────────────────────────────────
        $admin = User::updateOrCreate(
            ['email' => 'admin@incidents.local'],
            [
                'first_name'   => 'Administrador',
                'last_name' => 'Sistema',
                'password' => 'password', // Se hashea automáticamente por el cast 'hashed'
                'is_active'   => true,
            ]
        );

        // Asignar rol de administrador
        $rolAdmin = Role::where('code', 'ADMIN')->first();
        if ($rolAdmin) {
            $admin->roles()->sync([
                $rolAdmin->id => [
                    'assigned_at' => now(),
                ],
            ]);
        }

        // 4. Datos demo para desarrollo y pruebas manuales.
        $this->call(DemoUserSeeder::class);
        $this->call(DemoIncidentSeeder::class);
        $this->call(DemoNotificationSeeder::class);
    }
}

