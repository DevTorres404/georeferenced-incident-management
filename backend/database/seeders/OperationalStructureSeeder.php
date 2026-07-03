<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\SupervisorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

final class OperationalStructureSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $admin = $this->adminUser();
            $roles = Role::query()
                ->whereIn('code', ['ADMIN', 'SUPERVISOR', 'OPERADOR'])
                ->get()
                ->keyBy('code');
            $admin->roles()->sync([
                $roles['ADMIN']->id => [
                    'assigned_by' => null,
                    'assigned_at' => now(),
                ],
            ]);
            $zones = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                ->orderBy('code')
                ->get()
                ->keyBy('code');

            $supervisors = [
                ['zone_code' => 'Z1', 'first_name' => 'Adriana', 'last_name' => 'Mero', 'email' => 'supervisor.costa.norte@incidents.local', 'username' => 'adriana.mero', 'phone' => '0991000001'],
                ['zone_code' => 'Z2', 'first_name' => 'Bruno', 'last_name' => 'Aviles', 'email' => 'supervisor.guayas@incidents.local', 'username' => 'bruno.aviles', 'phone' => '0991000002'],
                ['zone_code' => 'Z3', 'first_name' => 'Carmen', 'last_name' => 'Piguave', 'email' => 'supervisor.costa.sur@incidents.local', 'username' => 'carmen.piguave', 'phone' => '0991000003'],
                ['zone_code' => 'Z4', 'first_name' => 'Diego', 'last_name' => 'Burbano', 'email' => 'supervisor.sierra.centro@incidents.local', 'username' => 'diego.burbano', 'phone' => '0991000004'],
                ['zone_code' => 'Z5', 'first_name' => 'Elena', 'last_name' => 'Siguenza', 'email' => 'supervisor.austro@incidents.local', 'username' => 'elena.siguenza', 'phone' => '0991000005'],
                ['zone_code' => 'Z6', 'first_name' => 'Fabian', 'last_name' => 'Shiguango', 'email' => 'supervisor.amazonia.sur@incidents.local', 'username' => 'fabian.shiguango', 'phone' => '0991000006'],
                ['zone_code' => 'Z7', 'first_name' => 'Gabriela', 'last_name' => 'Munoz', 'email' => 'supervisor.insular@incidents.local', 'username' => 'gabriela.munoz', 'phone' => '0991000007'],
                ['zone_code' => 'Z8', 'first_name' => 'Hector', 'last_name' => 'Jimpikit', 'email' => 'supervisor.amazonia.norte@incidents.local', 'username' => 'hector.jimpikit', 'phone' => '0991000008'],
            ];

            foreach ($supervisors as $index => $data) {
                $zone = $zones[$data['zone_code']] ?? null;

                if (! $zone) {
                    continue;
                }

                $supervisor = $this->user($data, $roles['SUPERVISOR']->id, (int) $admin->id);

                SupervisorProfile::query()->updateOrCreate(
                    ['user_id' => $supervisor->id],
                    ['max_operators' => 5, 'active' => true]
                );

                $this->syncActiveTerritory((int) $supervisor->id, (int) $zone->id, (int) $admin->id);

                for ($position = 1; $position <= 5; $position++) {
                    $zoneNumber = $index + 1;
                    $zoneSuffix = strtolower(substr($data['zone_code'], 1));

                    $operator = $this->user([
                        'first_name' => "Operador{$position}",
                        'last_name' => "Zona{$zoneNumber}",
                        'email' => sprintf('operador.z%s.%02d@incidents.local', $zoneSuffix, $position),
                        'username' => sprintf('operador.z%s.%02d', $zoneSuffix, $position),
                        'phone' => sprintf('0992%03d%03d', $zoneNumber, $position),
                    ], $roles['OPERADOR']->id, (int) $admin->id);

                    OperatorProfile::query()->updateOrCreate(
                        ['user_id' => $operator->id],
                        [
                            'incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY,
                            'max_active_incidents' => OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS,
                            'max_workload_points' => OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                            'active' => true,
                        ]
                    );

                    $this->syncActiveTerritory((int) $operator->id, (int) $zone->id, (int) $admin->id);
                    $this->syncActiveSupervisorOperator((int) $supervisor->id, (int) $operator->id, (int) $admin->id);
                }
            }
        });
    }

    private function adminUser(): User
    {
        return User::query()->firstOrCreate(
            ['email' => 'admin@incidents.local'],
            [
                'first_name' => 'Administrador',
                'last_name' => 'General',
                'password' => 'password',
                'is_active' => true,
            ]
        );
    }

    /**
     * @param array<string, string> $data
     */
    private function user(array $data, int $roleId, int $assignedBy): User
    {
        $user = User::query()
            ->where('email', $data['email'])
            ->orWhere('username', $data['username'])
            ->first();

        if ($user) {
            $user->forceFill([
                'email' => $data['email'],
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'username' => $data['username'],
                'phone' => $data['phone'],
                'password' => 'password',
                'is_active' => true,
            ])->save();
        } else {
            $user = User::query()->create([
                'email' => $data['email'],
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'username' => $data['username'],
                'phone' => $data['phone'],
                'password' => 'password',
                'is_active' => true,
            ]);
        }

        $user->forceFill([
            'email_verified_at' => now(),
            'two_factor_confirmed_at' => now(),
        ])->save();

        $user->roles()->sync([
            $roleId => [
                'assigned_by' => $assignedBy,
                'assigned_at' => now(),
            ],
        ]);

        return $user;
    }

    private function syncActiveTerritory(int $userId, int $territoryId, int $assignedBy): void
    {
        UserTerritory::query()
            ->where('user_id', $userId)
            ->where('is_active', true)
            ->where('territorial_unit_id', '!=', $territoryId)
            ->update([
                'is_active' => false,
                'unassigned_at' => now(),
            ]);

        $existing = UserTerritory::query()
            ->where('user_id', $userId)
            ->where('territorial_unit_id', $territoryId)
            ->where('is_active', true)
            ->first();

        if ($existing) {
            return;
        }

        UserTerritory::query()->create([
            'user_id' => $userId,
            'territorial_unit_id' => $territoryId,
            'assigned_by' => $assignedBy,
            'assigned_at' => now(),
            'is_active' => true,
        ]);
    }

    private function syncActiveSupervisorOperator(int $supervisorUserId, int $operatorUserId, int $assignedBy): void
    {
        SupervisorOperatorAssignment::query()
            ->where('operator_user_id', $operatorUserId)
            ->where('is_active', true)
            ->where('supervisor_user_id', '!=', $supervisorUserId)
            ->update([
                'is_active' => false,
                'unassigned_at' => now(),
            ]);

        $existing = SupervisorOperatorAssignment::query()
            ->where('supervisor_user_id', $supervisorUserId)
            ->where('operator_user_id', $operatorUserId)
            ->where('is_active', true)
            ->first();

        if ($existing) {
            return;
        }

        SupervisorOperatorAssignment::query()->create([
            'supervisor_user_id' => $supervisorUserId,
            'operator_user_id' => $operatorUserId,
            'assigned_by' => $assignedBy,
            'assigned_at' => now(),
            'is_active' => true,
        ]);
    }
}
