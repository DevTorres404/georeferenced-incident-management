<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use Illuminate\Database\Seeder;

/**
 * Seeder de roles del sistema.
 *
 * Crea los 4 roles base necesarios para el funcionamiento
 * del sistema de gestión de incidents.
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            [
                'code' => 'ADMIN',
                'name' => 'Administrador',
                'description' => 'Acceso total al sistema. Gestiona usuarios, roles, configuración y reportes.',
            ],
            [
                'code' => 'SUPERVISOR',
                'name' => 'Supervisor',
                'description' => 'Supervisa incidents, asigna operadores, aprueba resoluciones y genera reportes.',
            ],
            [
                'code' => 'OPERADOR',
                'name' => 'Operador',
                'description' => 'Atiende incidents asignadas, actualiza states y registra avances.',
            ],
            [
                'code' => 'CIUDADANO',
                'name' => 'Ciudadano',
                'description' => 'Reporta incidents, consulta el estado de sus reportes y recibe notificaciones.',
            ],
        ];

        foreach ($roles as $rol) {
            Role::updateOrCreate(
                ['code' => $rol['code']],
                $rol
            );
        }
    }
}
