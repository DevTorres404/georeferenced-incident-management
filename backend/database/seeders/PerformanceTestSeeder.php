<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class PerformanceTestSeeder extends Seeder
{
    /**
     * ATENCIÓN: Este seeder crea usuarios de prueba diseñados
     * exclusivamente para pruebas de carga y estrés (k6).
     * ¡No ejecutar en entornos de PRODUCCIÓN sin aislamiento!
     */
    public function run(): void
    {
        $users = [
            [
                'role' => 'ADMIN',
                'first_name' => 'LoadTest',
                'last_name' => 'Admin',
                'username' => 'perf.admin',
                'email' => 'admin.test@incidents.local',
                'phone' => '0999999991',
                'password' => 'SGI.perf.2026!',
            ],
            [
                'role' => 'OPERADOR',
                'first_name' => 'LoadTest',
                'last_name' => 'Operator',
                'username' => 'perf.operator',
                'email' => 'operator.test@incidents.local',
                'phone' => '0999999992',
                'password' => 'SGI.perf.2026!',
            ]
        ];

        // Se usa un usuario comodín para el assigned_by si no hay un admin real
        $assignedBy = User::where('email', 'admin@incidents.local')->first()?->id ?? 1;

        foreach ($users as $data) {
            $roleCode = $data['role'];
            $password = $data['password'];
            unset($data['role']);
            unset($data['password']);

            $user = User::updateOrCreate(
                ['email' => $data['email']],
                [
                    ...$data,
                    'password' => $password,
                    'is_active' => true,
                ]
            );

            $user->forceFill([
                'email_verified_at' => Carbon::now(),
                'last_login' => Carbon::now(),
            ])->save();

            $role = Role::where('code', $roleCode)->first();
            if ($role) {
                $user->roles()->sync([
                    $role->id => [
                        'assigned_by' => $assignedBy,
                        'assigned_at' => Carbon::now(),
                    ],
                ]);
            }
        }
    }
}
