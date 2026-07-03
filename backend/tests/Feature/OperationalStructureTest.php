<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\OperationalStructureSeeder;
use Database\Seeders\OperationalZoneGeometrySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_operational_structure_seeder_creates_eight_zones_with_one_supervisor_and_five_operators_each(): void
    {
        $this->seedBaseStructure();

        $zones = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->orderBy('code')
            ->get();

        $this->assertCount(8, $zones);

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
            'max_active_incidents' => 10,
            'max_workload_points' => 20,
            'active' => true,
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
                'max_active_incidents' => 35,
                'max_workload_points' => 55,
                'active' => false,
            ])->assertOk()
            ->assertJsonPath('data.max_active_incidents', 35)
            ->assertJsonPath('data.max_workload_points', 55)
            ->assertJsonPath('data.active', false);

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

    public function test_supervisor_change_transfers_zone_operators_and_pending_notifications(): void
    {
        $this->seedBaseStructure();
        $admin = $this->authenticateAdmin();

        $zones = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->whereIn('code', ['Z1', 'Z2'])
            ->orderBy('code')
            ->get()
            ->keyBy('code');

        $currentSupervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zones['Z1']->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');
        $newSupervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zones['Z2']->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');

        $zoneOperatorIds = SupervisorOperatorAssignment::query()
            ->where('supervisor_user_id', $currentSupervisorId)
            ->where('is_active', true)
            ->pluck('operator_user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $province = TerritorialUnit::query()
            ->where('parent_id', $zones['Z1']->id)
            ->where('type', TerritorialUnit::TYPE_PROVINCE)
            ->firstOrFail();

        $incidentCode = 'INC-Z1-TRANSFER-001';
        $this->createActiveIncidentForOperator($incidentCode, $province, $admin, $zoneOperatorIds[0], $currentSupervisorId);

        DB::table('core.notifications')->insert([
            'user_id' => $currentSupervisorId,
            'title' => 'Incidencia critica creada',
            'message' => "Supervisa la incidencia {$incidentCode}.",
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/admin/operations/zones/{$zones['Z1']->id}/supervisor", [
                'supervisor_user_id' => $newSupervisorId,
            ])->assertOk()
            ->assertJsonPath('data.supervisor.id', $newSupervisorId);

        foreach ($zoneOperatorIds as $operatorId) {
            $this->assertDatabaseHas('auth.supervisor_operator_assignments', [
                'supervisor_user_id' => $newSupervisorId,
                'operator_user_id' => $operatorId,
                'is_active' => true,
            ]);
        }

        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $newSupervisorId,
            'message' => "Supervisa la incidencia {$incidentCode}.",
            'is_read' => false,
        ]);
    }

    public function test_operator_replacement_transfers_active_incidents_and_pending_notifications(): void
    {
        $this->seedBaseStructure();
        $admin = $this->authenticateAdmin();

        $zone = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->where('code', 'Z1')
            ->firstOrFail();

        $supervisorId = (int) UserTerritory::query()
            ->where('territorial_unit_id', $zone->id)
            ->where('is_active', true)
            ->whereHas('user.roles', fn ($query) => $query->where('code', 'SUPERVISOR'))
            ->value('user_id');
        $currentOperatorId = (int) SupervisorOperatorAssignment::query()
            ->where('supervisor_user_id', $supervisorId)
            ->where('is_active', true)
            ->value('operator_user_id');

        $replacementOperator = $this->createOperatorInZone($zone, $admin);
        $province = TerritorialUnit::query()
            ->where('parent_id', $zone->id)
            ->where('type', TerritorialUnit::TYPE_PROVINCE)
            ->firstOrFail();

        $incidentCode = 'INC-Z1-TRANSFER-002';
        $incidentId = $this->createActiveIncidentForOperator($incidentCode, $province, $admin, $currentOperatorId, $supervisorId);

        DB::table('core.notifications')->insert([
            'user_id' => $currentOperatorId,
            'title' => 'Incidencia asignada',
            'message' => "Debes atender la incidencia {$incidentCode}.",
            'type' => 'INCIDENT_ASSIGNED',
            'is_read' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/admin/operations/operators/{$currentOperatorId}/replacement", [
                'replacement_operator_user_id' => (int) $replacementOperator->id,
            ])->assertOk()
            ->assertJsonPath('data.operator.id', (int) $replacementOperator->id);

        $this->assertDatabaseHas('core.incidents', [
            'id' => $incidentId,
            'current_assigned_id' => (int) $replacementOperator->id,
        ]);
        $this->assertDatabaseHas('core.notifications', [
            'user_id' => (int) $replacementOperator->id,
            'message' => "Debes atender la incidencia {$incidentCode}.",
            'is_read' => false,
        ]);
        $this->assertDatabaseHas('auth.supervisor_operator_assignments', [
            'supervisor_user_id' => $supervisorId,
            'operator_user_id' => (int) $replacementOperator->id,
            'is_active' => true,
        ]);
    }

    private function seedBaseStructure(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            TerritorialUnitSeeder::class,
            OperationalZoneGeometrySeeder::class,
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

    private function createActiveIncidentForOperator(string $code, TerritorialUnit $territory, User $reporter, int $operatorUserId, int $assignedByUserId): int
    {
        $categoryId = (int) DB::table('core.categories')->insertGetId([
            'name' => 'Prueba Operativa '.str_replace('-', '', $code),
            'description' => 'Categoria de prueba',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $priorityId = (int) DB::table('core.priorities')->insertGetId([
            'name' => 'Alta '.$code,
            'level' => 2,
            'color' => '#ff6600',
            'sla_hours' => 24,
            'weight' => 3,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $stateId = (int) DB::table('core.states')->insertGetId([
            'name' => 'EN_PROGRESO_'.$code,
            'description' => 'Estado activo de prueba',
            'color' => '#0ea5e9',
            'is_initial_state' => false,
            'is_final_state' => false,
            'allows_edition' => true,
            'order' => 100,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $incidentId = (int) DB::table('core.incidents')->insertGetId([
            'code' => $code,
            'title' => 'Incidencia de prueba '.$code,
            'description' => 'Transferencia operativa en pruebas.',
            'category_id' => $categoryId,
            'subcategory_id' => null,
            'priority_id' => $priorityId,
            'state_id' => $stateId,
            'territorial_unit_id' => $territory->id,
            'address' => 'Direccion de prueba',
            'address_reference' => 'Referencia de prueba',
            'latitude' => null,
            'longitude' => null,
            'reported_by_id' => $reporter->id,
            'current_assigned_id' => $operatorUserId,
            'resolution_date' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('core.incident_assignments')->insert([
            'incident_id' => $incidentId,
            'user_id' => $operatorUserId,
            'assigned_by_id' => $assignedByUserId,
            'assignment_date' => now(),
            'unassignment_date' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $incidentId;
    }

    private function createOperatorInZone(TerritorialUnit $zone, User $admin): User
    {
        $operatorRole = Role::query()->where('code', 'OPERADOR')->firstOrFail();
        $operator = User::factory()->create([
            'email' => 'replacement-'.$zone->code.'@incidents.local',
            'two_factor_confirmed_at' => now(),
        ]);
        $operator->roles()->sync([$operatorRole->id]);

        OperatorProfile::query()->create([
            'user_id' => $operator->id,
            'incident_capacity' => 20,
            'max_active_incidents' => 10,
            'max_workload_points' => 20,
            'active' => true,
        ]);

        UserTerritory::query()->create([
            'user_id' => $operator->id,
            'territorial_unit_id' => $zone->id,
            'assigned_by' => $admin->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);

        return $operator->fresh('roles');
    }
}
