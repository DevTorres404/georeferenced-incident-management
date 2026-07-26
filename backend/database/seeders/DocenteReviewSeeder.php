<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Seeder para revisión académica del docente.
 *
 * Crea el usuario admindocente con rol ADMIN para que la docente
 * pueda revisar el sistema con acceso completo.
 *
 * Credenciales:
 *   email:    admindocente@incidents.local
 *   password: password
 */
class DocenteReviewSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'admindocente@incidents.local'],
            [
                'first_name'        => 'Revisión',
                'last_name'         => 'Docente',
                'username'          => 'admin.docente',
                'password'          => 'password',
                'is_active'         => true,
                'email_verified_at' => Carbon::now(),
            ]
        );

        $role = Role::where('code', 'ADMIN')->first();

        if ($role) {
            $assignedBy = User::where('email', 'admin@incidents.local')->value('id');

            $user->roles()->sync([
                $role->id => [
                    'assigned_by' => $assignedBy,
                    'assigned_at' => Carbon::now(),
                ],
            ]);
        }
    }
}
