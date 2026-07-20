<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MyTeamReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_supervisor_can_download_report_of_assigned_operator()
    {
        $this->seed([
            RoleSeeder::class, 
            PermissionSeeder::class,
            \Database\Seeders\CategorySeeder::class,
            \Database\Seeders\PrioritySeeder::class,
            \Database\Seeders\StateSeeder::class,
        ]);
        
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor@incidencias.local');
        $operator = User::factory()->create();

        SupervisorOperatorAssignment::create([
            'supervisor_user_id' => $supervisor->id,
            'operator_user_id' => $operator->id,
            'is_active' => true,
        ]);

        $category = \App\Incidents\Infrastructure\Persistence\Models\Category::first();
        $priority = \App\Incidents\Infrastructure\Persistence\Models\Priority::first();
        $state = \App\Incidents\Infrastructure\Persistence\Models\State::first();

        $incident = \App\Incidents\Infrastructure\Persistence\Models\Incident::create([
            'code' => 'TEST-123',
            'title' => 'Test de integración',
            'description' => 'Test',
            'state_id' => $state->id,
            'category_id' => $category->id,
            'priority_id' => $priority->id,
            'reported_by_id' => $operator->id,
            'latitude' => 0,
            'longitude' => 0,
        ]);

        \App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment::create([
            'incident_id' => $incident->id,
            'user_id' => $operator->id,
            'assignment_role' => 'PRIMARY',
            'assigned_by_id' => $supervisor->id,
            'assignment_date' => now(),
        ]);

        $response = $this->actingAsUser($supervisor)
            ->get("/api/team/operators/{$operator->id}/work-report");

        $response->assertStatus(200);
        $response->assertHeader('content-type', 'application/pdf');
    }

    public function test_supervisor_can_preview_report_of_assigned_operator()
    {
        $this->seed([
            RoleSeeder::class, 
            PermissionSeeder::class,
            \Database\Seeders\CategorySeeder::class,
            \Database\Seeders\PrioritySeeder::class,
            \Database\Seeders\StateSeeder::class,
        ]);
        
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-preview@incidencias.local');
        $operator = User::factory()->create();

        SupervisorOperatorAssignment::create([
            'supervisor_user_id' => $supervisor->id,
            'operator_user_id' => $operator->id,
            'is_active' => true,
        ]);

        $response = $this->actingAsUser($supervisor)
            ->getJson("/api/team/operators/{$operator->id}/work-report-data");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'operator' => ['id', 'first_name', 'last_name', 'email'],
            'metrics' => [
                'total_assigned',
                'total_resolved',
                'reopened_count',
                'avg_response_hours',
                'reopen_rate',
                'current_workload',
            ],
            'recent_incidents' => [
                '*' => [
                    'incident' => ['id', 'code', 'title', 'state'],
                    'latest_assignment_date',
                    'history' => [
                        '*' => [
                            'assignment_date',
                            'resolved_at',
                            'duration_minutes',
                            'priority_name',
                            'state_name',
                            'final_cycle_state',
                            'assigned_by_name',
                        ]
                    ]
                ]
            ]
        ]);
    }

    public function test_supervisor_cannot_download_report_of_unassigned_operator()
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);
        
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-no-team@incidencias.local');
        $unassignedOperator = User::factory()->create();

        $response = $this->actingAsUser($supervisor)
            ->get("/api/team/operators/{$unassignedOperator->id}/work-report");

        $response->assertStatus(403);
    }

    private function authenticateAs(string $roleCode, string $email): User
    {
        $user = User::factory()->create([
            'email' => $email,
            'two_factor_confirmed_at' => now(),
        ]);
        $role = Role::where('code', $roleCode)->firstOrFail();
        
        // Asignamos todos los permisos al rol para asegurar que pase middleware
        $role->permissions()->syncWithoutDetaching(
            Permission::pluck('id')->all()
        );
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function actingAsUser(User $user): self
    {
        Sanctum::actingAs($user->fresh(), ['*']);
        return $this;
    }
}
