<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardMetricsTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_with_permission_can_get_metrics()
    {
        $this->seedCoreData();
        $admin = $this->authenticateAs('ADMIN', 'admin@incidencias.local');

        $stateN = State::where('name', 'NUEVA')->firstOrFail();
        $stateR = State::where('name', 'RESUELTA')->firstOrFail();
        $cat = Category::firstOrFail();
        $pri = Priority::firstOrFail();

        // Create incidents
        for ($i = 0; $i < 3; $i++) {
            Incident::create([
                'code' => "INC-$i",
                'title' => "Incident $i",
                'description' => 'Test',
                'state_id' => $stateN->id,
                'category_id' => $cat->id,
                'priority_id' => $pri->id,
                'reported_by_id' => $admin['user']->id,
                'latitude' => 0,
                'longitude' => 0,
            ]);
        }

        for ($i = 0; $i < 2; $i++) {
            Incident::create([
                'code' => "RES-$i",
                'title' => "Resolved $i",
                'description' => 'Test',
                'state_id' => $stateR->id,
                'category_id' => $cat->id,
                'priority_id' => $pri->id,
                'reported_by_id' => $admin['user']->id,
                'latitude' => 0,
                'longitude' => 0,
                'resolution_date' => now(),
            ]);
        }

        $response = $this->actingAsUser($admin['user'])
            ->getJson('/api/dashboard/metrics');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'kpis' => ['total', 'pending', 'progress', 'resolved'],
                    'countsByCategory',
                    'countsByPriority',
                    'countsByState',
                    'monthlyTrend' => ['months', 'series'],
                    'topCities',
                    'averageResolutionDays',
                ],
            ])
            ->assertJsonPath('data.kpis.total', 5)
            ->assertJsonPath('data.kpis.pending', 3)
            ->assertJsonPath('data.kpis.resolved', 2);
    }

    public function test_supervisor_only_receives_metrics_from_assigned_zone(): void
    {
        $this->seedCoreData();
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-dashboard@incidencias.local');

        $country = TerritorialUnit::create([
            'name' => 'Ecuador',
            'type' => TerritorialUnit::TYPE_COUNTRY,
            'code' => 'EC-TEST',
            'is_active' => true,
        ]);
        $assignedZone = TerritorialUnit::create([
            'name' => 'Zona asignada',
            'type' => TerritorialUnit::TYPE_OPERATIONAL_ZONE,
            'parent_id' => $country->id,
            'code' => 'ZONE-A',
            'is_active' => true,
        ]);
        $outsideZone = TerritorialUnit::create([
            'name' => 'Zona externa',
            'type' => TerritorialUnit::TYPE_OPERATIONAL_ZONE,
            'parent_id' => $country->id,
            'code' => 'ZONE-B',
            'is_active' => true,
        ]);
        $assignedTerritory = TerritorialUnit::create([
            'name' => 'Provincia asignada',
            'type' => TerritorialUnit::TYPE_PROVINCE,
            'parent_id' => $assignedZone->id,
            'code' => 'PROV-A',
            'is_active' => true,
        ]);
        $outsideTerritory = TerritorialUnit::create([
            'name' => 'Provincia externa',
            'type' => TerritorialUnit::TYPE_PROVINCE,
            'parent_id' => $outsideZone->id,
            'code' => 'PROV-B',
            'is_active' => true,
        ]);

        UserTerritory::create([
            'user_id' => $supervisor['user']->id,
            'territorial_unit_id' => $assignedZone->id,
            'assigned_by' => $supervisor['user']->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);

        $state = State::where('name', 'NUEVA')->firstOrFail();
        $category = Category::firstOrFail();
        $priority = Priority::firstOrFail();

        foreach ([
            ['code' => 'ZONE-A-1', 'territory_id' => $assignedTerritory->id],
            ['code' => 'ZONE-A-2', 'territory_id' => $assignedTerritory->id],
            ['code' => 'ZONE-B-1', 'territory_id' => $outsideTerritory->id],
        ] as $incidentData) {
            Incident::create([
                'code' => $incidentData['code'],
                'title' => $incidentData['code'],
                'description' => 'Prueba de alcance territorial',
                'state_id' => $state->id,
                'category_id' => $category->id,
                'priority_id' => $priority->id,
                'territorial_unit_id' => $incidentData['territory_id'],
                'reported_by_id' => $supervisor['user']->id,
            ]);
        }

        $response = $this->actingAsUser($supervisor['user'])
            ->getJson('/api/dashboard/metrics');

        $response->assertOk()
            ->assertJsonPath('data.kpis.total', 2)
            ->assertJsonPath('data.kpis.pending', 2)
            ->assertJsonCount(1, 'data.topCities');

        $this->assertSame(2, array_sum($response->json('data.countsByCategory')));
        $this->assertSame(2, array_sum($response->json('data.countsByPriority')));
        $this->assertSame(2, array_sum($response->json('data.countsByState')));
        
        $totalInTrend = 0;
        foreach ($response->json('data.monthlyTrend.series') as $serie) {
            $totalInTrend += array_sum($serie['data']);
        }
        $this->assertSame(2, $totalInTrend);
        
        $this->assertSame(2, array_sum(array_column($response->json('data.topCities'), 'count')));

        $unassignedSupervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-without-zone@incidencias.local');
        $this->actingAsUser($unassignedSupervisor['user'])
            ->getJson('/api/dashboard/metrics')
            ->assertOk()
            ->assertJsonPath('data.kpis.total', 0)
            ->assertJsonPath('data.countsByCategory', [])
            ->assertJsonPath('data.topCities', []);
    }

    private function seedCoreData(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            StateSeeder::class,
            PrioritySeeder::class,
            CategorySeeder::class,
        ]);
    }

    private function authenticateAs(string $roleCode, string $email): array
    {
        $user = User::factory()->create([
            'email' => $email,
            'two_factor_confirmed_at' => now(),
        ]);
        $role = Role::where('code', $roleCode)->firstOrFail();
        $role->permissions()->syncWithoutDetaching(
            Permission::pluck('id')->all()
        );
        $user->roles()->sync([$role->id]);

        return ['user' => $user];
    }

    private function actingAsUser(User $user): self
    {
        Sanctum::actingAs($user->fresh(), ['*']);

        return $this;
    }
}
