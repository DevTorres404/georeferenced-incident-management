<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
                'resolution_date' => now()
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
                    'monthlyTrend' => ['months', 'registered', 'resolved', 'pending'],
                    'topCities',
                    'averageResolutionDays'
                ]
            ])
            ->assertJsonPath('data.kpis.total', 5)
            ->assertJsonPath('data.kpis.pending', 3)
            ->assertJsonPath('data.kpis.resolved', 2);
    }

    private function seedCoreData(): void
    {
        $this->seed([
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\StateSeeder::class,
            \Database\Seeders\PrioritySeeder::class,
            \Database\Seeders\CategorySeeder::class,
        ]);
    }

    private function authenticateAs(string $roleCode, string $email): array
    {
        $user = User::factory()->create([
            'email' => $email,
            'two_factor_confirmed_at' => now(),
        ]);
        $role = \App\Auth\Infrastructure\Persistence\Models\Role::where('code', $roleCode)->firstOrFail();
        $role->permissions()->syncWithoutDetaching(
            \App\Auth\Infrastructure\Persistence\Models\Permission::pluck('id')->all()
        );
        $user->roles()->sync([$role->id]);

        return ['user' => $user];
    }

    private function actingAsUser(User $user): self
    {
        \Laravel\Sanctum\Sanctum::actingAs($user->fresh(), ['*']);
        return $this;
    }
}
