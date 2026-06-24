<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DemoUserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            [
                'role' => 'ADMIN',
                'first_name' => 'Administrador',
                'last_name' => 'Sistema',
                'username' => 'admin.sistema',
                'email' => 'admin@incidents.local',
                'phone' => '0990000001',
            ],
            [
                'role' => 'SUPERVISOR',
                'first_name' => 'Carla',
                'last_name' => 'Mendoza',
                'username' => 'carla.mendoza',
                'email' => 'supervisor@incidents.local',
                'phone' => '0990000002',
            ],
            [
                'role' => 'OPERADOR',
                'first_name' => 'Luis',
                'last_name' => 'Andrade',
                'username' => 'luis.andrade',
                'email' => 'operador1@incidents.local',
                'phone' => '0990000003',
            ],
            [
                'role' => 'OPERADOR',
                'first_name' => 'Nadia',
                'last_name' => 'Vera',
                'username' => 'nadia.vera',
                'email' => 'operador2@incidents.local',
                'phone' => '0990000004',
            ],
            [
                'role' => 'CIUDADANO',
                'first_name' => 'Mateo',
                'last_name' => 'Rojas',
                'username' => 'mateo.rojas',
                'email' => 'ciudadano1@incidents.local',
                'phone' => '0990000005',
            ],
            [
                'role' => 'CIUDADANO',
                'first_name' => 'Sofia',
                'last_name' => 'Castillo',
                'username' => 'sofia.castillo',
                'email' => 'ciudadano2@incidents.local',
                'phone' => '0990000006',
            ],
            [
                'role' => 'CIUDADANO',
                'first_name' => 'Diego',
                'last_name' => 'Paredes',
                'username' => 'diego.paredes',
                'email' => 'ciudadano3@incidents.local',
                'phone' => '0990000007',
            ],
        ];

        $assignedBy = User::where('email', 'admin@incidents.local')->first()?->id;

        foreach ($users as $data) {
            $roleCode = $data['role'];
            unset($data['role']);

            $user = User::updateOrCreate(
                ['email' => $data['email']],
                [
                    ...$data,
                    'password' => 'password',
                    'is_active' => true,
                ]
            );

            $user->forceFill([
                'email_verified_at' => Carbon::now(),
                'last_login' => Carbon::now()->subMinutes(rand(15, 180)),
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
