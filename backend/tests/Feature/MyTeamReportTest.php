<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MyTeamReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_operator_report_template_renders_the_visual_hierarchy_and_scope(): void
    {
        $html = view('pdf.operator-work-report', [
            'operator' => [
                'id' => 7,
                'first_name' => 'Ana',
                'last_name' => 'Pérez',
                'email' => 'ana@example.test',
            ],
            'metrics' => [
                'current_workload' => 8,
                'total_assigned' => 14,
                'total_resolved' => 11,
                'avg_response_hours' => 4.5,
                'reopen_rate' => 9.1,
            ],
            'recent_incidents' => [],
            'report_scope_label' => 'Últimas 100 intervenciones',
        ])->render();

        $this->assertStringContainsString('class="report-title"', $html);
        $this->assertStringContainsString('class="brand-logo"', $html);
        $this->assertStringContainsString('SGI_LOGO.jpg', $html);
        $this->assertStringContainsString('Dirección de operaciones y seguimiento territorial', $html);
        $this->assertStringContainsString('Versión documental: 1.0', $html);
        $this->assertStringContainsString('Clasificación:', $html);
        $this->assertStringContainsString('Documento institucional', $html);
        $this->assertStringContainsString('class="operator-sheet"', $html);
        $this->assertStringContainsString('class="metrics-table"', $html);
        $this->assertStringContainsString('Registro de intervenciones', $html);
        $this->assertStringContainsString('Últimas 100 intervenciones', $html);
        $this->assertStringContainsString('Nota metodológica', $html);

        $cycleHtml = view('pdf.operator-work-report', [
            'operator' => [
                'id' => 7,
                'first_name' => 'Ana',
                'last_name' => 'Pérez',
                'email' => 'ana@example.test',
            ],
            'metrics' => [
                'current_workload' => 8,
                'total_assigned' => 14,
                'total_resolved' => 11,
                'avg_response_hours' => 4.5,
                'reopen_rate' => 9.1,
            ],
            'recent_incidents' => [[
                'incident' => [
                    'id' => 25,
                    'title' => 'Caso de prueba',
                    'category' => ['name' => 'Prueba'],
                    'territorial_unit' => ['name' => 'Zona de prueba'],
                    'state' => ['name' => 'EN_PROGRESO', 'is_final_state' => false],
                    'updated_at' => now()->toISOString(),
                ],
                'latest_assignment_date' => now()->toISOString(),
                'reopen_count' => 0,
                'history' => [[
                    'state_name' => 'EN_PROGRESO',
                    'priority_name' => 'ALTA',
                    'assignment_date' => now()->toISOString(),
                    'duration_minutes' => 185,
                    'assigned_by_name' => 'Supervisor',
                ]],
            ]],
            'report_scope_label' => 'Últimas 50 intervenciones',
        ])->render();

        $this->assertStringContainsString('3 h 05 min', $cycleHtml);
        $this->assertStringContainsString('horas y minutos', $cycleHtml);
    }

    public function test_supervisor_can_download_report_of_assigned_operator()
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            CategorySeeder::class,
            PrioritySeeder::class,
            StateSeeder::class,
        ]);

        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor@incidencias.local');
        $operator = User::factory()->create();

        SupervisorOperatorAssignment::create([
            'supervisor_user_id' => $supervisor->id,
            'operator_user_id' => $operator->id,
            'is_active' => true,
        ]);

        $category = Category::first();
        $priority = Priority::first();
        $state = State::first();

        $incident = Incident::create([
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

        IncidentAssignment::create([
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
            CategorySeeder::class,
            PrioritySeeder::class,
            StateSeeder::class,
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
                        ],
                    ],
                ],
            ],
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
