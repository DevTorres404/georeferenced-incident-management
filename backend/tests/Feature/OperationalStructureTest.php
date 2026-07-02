<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\OperationalStructureSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class OperationalStructureTest extends TestCase
{
    use RefreshDatabase;

    public function test_operational_zone_can_be_resolved_from_province_parish_and_sector(): void
    {
        $this->seedBaseStructure();
        $admin = $this->authenticateAdmin();

        $province = TerritorialUnit::query()->where('type', TerritorialUnit::TYPE_PROVINCE)->where('name', 'Santa Elena')->firstOrFail();
        $canton = TerritorialUnit::query()->where('type', TerritorialUnit::TYPE_CANTON)->where('parent_id', $province->id)->orderBy('name')->firstOrFail();
        $parish = TerritorialUnit::query()->where('type', TerritorialUnit::TYPE_PARISH)->where('parent_id', $canton->id)->orderBy('name')->firstOrFail();
        $sector = TerritorialUnit::query()->create([
            'name' => 'Sector Test Costa Sur',
            'type' => TerritorialUnit::TYPE_SECTOR,
            'parent_id' => $parish->id,
            'code' => 'SEC-TEST-CS',
            'is_active' => true,
        ]);

        foreach ([$province, $parish, $sector] as $unit) {
            $response = $this->actingAsUser($admin)
                ->getJson("/api/territorial-units/{$unit->id}/operational-zone");

            $response->assertOk()
                ->assertJsonPath('data.name', 'Costa Sur')
                ->assertJsonPath('data.type', TerritorialUnit::TYPE_OPERATIONAL_ZONE);
        }
    }

    public function test_operational_structure_seeder_creates_seven_zones_with_one_supervisor_and_five_operators_each(): void
    {
        $this->seedBaseStructure();

        $zones = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->orderBy('code')
            ->get();

        $this->assertCount(7, $zones);

        foreach ($zones as $zone) {
            $supervisorTerritories = UserTerritory::query()
                ->where('territorial_unit_id', $zone->id)
                ->where('is_active', true)
                ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
                ->get();

            $this->assertCount(1, $supervisorTerritories, "La zona {$zone->name} debe tener exactamente un supervisor activo.");

            $supervisorId = (int) $supervisorTerritories->first()->user_id;
            $this->assertSame(
                5,
                SupervisorOperatorAssignment::query()
                    ->where('supervisor_user_id', $supervisorId)
                    ->where('is_active', true)
                    ->count(),
                "El supervisor de {$zone->name} debe tener cinco operadores activos."
            );
        }
    }

    public function test_admin_cannot_assign_a_sixth_operator_when_supervisor_limit_is_five(): void
    {
        $this->seedBaseStructure();
        $admin = $this->authenticateAdmin();

        $zone = TerritorialUnit::query()->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)->where('code', 'Z1')->firstOrFail();
        $supervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zone->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');

        $existingOperatorIds = SupervisorOperatorAssignment::query()
            ->where('supervisor_user_id', $supervisorId)
            ->where('is_active', true)
            ->orderBy('operator_user_id')
            ->pluck('operator_user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $operatorRole = Role::query()->where('code', 'OPERADOR')->firstOrFail();
        $extraOperator = User::factory()->create([
            'email' => 'extra-operador-z1@incidents.local',
            'two_factor_confirmed_at' => now(),
        ]);
        $extraOperator->roles()->sync([$operatorRole->id]);
        OperatorProfile::query()->create([
            'user_id' => $extraOperator->id,
            'incident_capacity' => 20,
        ]);
        UserTerritory::query()->create([
            'user_id' => $extraOperator->id,
            'territorial_unit_id' => $zone->id,
            'assigned_by' => $admin->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);

        $response = $this->actingAsUser($admin)
            ->putJson("/api/admin/operations/supervisors/{$supervisorId}/operators", [
                'operator_user_ids' => [...$existingOperatorIds, (int) $extraOperator->id],
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'El supervisor ya alcanzo su limite de operadores activos.');
    }

    public function test_admin_can_update_limits_and_reassign_zone_supervisor(): void
    {
        $this->seedBaseStructure();
        $admin = $this->authenticateAdmin();

        $zones = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->whereIn('code', ['Z1', 'Z2'])
            ->orderBy('code')
            ->get()
            ->keyBy('code');

        $zoneOneSupervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zones['Z1']->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');

        $zoneTwoSupervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zones['Z2']->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');

        $operatorId = (int) SupervisorOperatorAssignment::query()
            ->where('supervisor_user_id', $zoneOneSupervisorId)
            ->where('is_active', true)
            ->value('operator_user_id');

        $this->actingAsUser($admin)
            ->patchJson("/api/admin/operations/supervisors/{$zoneOneSupervisorId}/profile", [
                'max_operators' => 6,
            ])->assertOk()
            ->assertJsonPath('data.max_operators', 6);

        $this->actingAsUser($admin)
            ->patchJson("/api/admin/operations/operators/{$operatorId}/profile", [
                'incident_capacity' => 35,
            ])->assertOk()
            ->assertJsonPath('data.incident_capacity', 35);

        $this->actingAsUser($admin)
            ->putJson("/api/admin/operations/zones/{$zones['Z1']->id}/supervisor", [
                'supervisor_user_id' => $zoneTwoSupervisorId,
            ])->assertOk()
            ->assertJsonPath('data.supervisor.id', $zoneTwoSupervisorId);

        $this->assertDatabaseHas('auth.user_territories', [
            'user_id' => $zoneTwoSupervisorId,
            'territorial_unit_id' => $zones['Z1']->id,
            'is_active' => true,
        ]);
        $this->assertDatabaseHas('auth.user_territories', [
            'user_id' => $zoneOneSupervisorId,
            'territorial_unit_id' => $zones['Z1']->id,
            'is_active' => false,
        ]);
    }

    private function seedBaseStructure(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            TerritorialUnitSeeder::class,
            OperationalStructureSeeder::class,
        ]);
    }

    private function authenticateAdmin(): User
    {
        $user = User::factory()->create([
            'email' => 'admin-ops@incidents.local',
            'two_factor_confirmed_at' => now(),
        ]);
        $role = Role::query()->where('code', 'ADMIN')->firstOrFail();
        $user->roles()->sync([$role->id]);

        return $user->fresh('roles');
    }

    private function actingAsUser(User $user): self
    {
        Sanctum::actingAs($user->fresh('roles'), ['*']);

        return $this;
    }
}
