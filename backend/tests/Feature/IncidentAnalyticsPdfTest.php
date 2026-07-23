<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IncidentAnalyticsPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_analytics_pdf_template_contains_institutional_sections(): void
    {
        $html = view('pdf.incident-analytics-report', [
            'analytics' => $this->analyticsFixture(),
            'filters' => ['start_date' => '2026-07-01', 'end_date' => '2026-07-31', 'category' => 'Alumbrado', 'state' => null],
            'generatedBy' => 'María Supervisora',
        ])->render();

        $this->assertStringContainsString('SGI_LOGO.jpg', $html);
        $this->assertStringContainsString('REPORTE ESTADÍSTICO INSTITUCIONAL', $html);
        $this->assertStringContainsString('Indicadores ejecutivos', $html);
        $this->assertStringContainsString('Distribución operativa', $html);
        $this->assertStringContainsString('Tendencia mensual', $html);
        $this->assertStringContainsString('Resumen por categoría', $html);
        $this->assertStringContainsString('María Supervisora', $html);
    }

    public function test_supervisor_can_download_filtered_analytics_pdf(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);
        $user = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::query()->where('code', 'SUPERVISOR')->firstOrFail();
        $user->roles()->sync([$role->id]);
        Sanctum::actingAs($user->fresh(), ['*']);

        $response = $this->get('/api/incidents/reports/analytics/pdf?start_date=2026-07-01&end_date=2026-07-31');

        $response->assertOk()
            ->assertHeader('content-type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_analytics_classifies_states_using_domain_behavior(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            StateSeeder::class,
            PrioritySeeder::class,
            CategorySeeder::class,
        ]);

        $user = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::query()->where('code', 'ADMIN')->firstOrFail();
        $role->permissions()->syncWithoutDetaching(Permission::pluck('id')->all());
        $user->roles()->sync([$role->id]);
        Sanctum::actingAs($user->fresh(), ['*']);

        $category = Category::query()->firstOrFail();
        $priority = Priority::query()->firstOrFail();

        foreach ([
            ['code' => 'ACTIVE-1', 'state' => 'EN_PROGRESO', 'resolved' => false],
            ['code' => 'RESOLVED-1', 'state' => 'RESUELTA', 'resolved' => true],
            ['code' => 'CLOSED-1', 'state' => 'CERRADA', 'resolved' => true],
            ['code' => 'REJECTED-1', 'state' => 'RECHAZADA', 'resolved' => false],
        ] as $data) {
            $incident = Incident::create([
                'code' => $data['code'],
                'title' => $data['code'],
                'description' => 'Domain state classification',
                'state_id' => State::query()->where('name', $data['state'])->firstOrFail()->id,
                'category_id' => $category->id,
                'priority_id' => $priority->id,
                'reported_by_id' => $user->id,
                'resolution_date' => $data['resolved'] ? now() : null,
            ]);
            $incident->forceFill(['due_date' => now()->subDay()])->save();
        }

        $response = $this->getJson('/api/incidents/reports/analytics');

        $response->assertOk();
        $response->assertJsonPath('data.total', 4);
        $response->assertJsonPath('data.active', 1);
        $response->assertJsonPath('data.resolved', 1);
        $response->assertJsonPath('data.closed', 2);
        $response->assertJsonPath('data.overdue', 1);
        $response->assertJsonPath('data.resolutionRate', 75);
    }

    /**
     * @return array<string, mixed>
     */
    private function analyticsFixture(): array
    {
        return [
            'total' => 12,
            'totalUniverse' => 30,
            'active' => 5,
            'resolved' => 7,
            'closed' => 0,
            'resolutionRate' => 58,
            'averageResolutionDays' => 2.5,
            'overdue' => 1,
            'countsByPriority' => ['Alta' => 5, 'Media' => 7],
            'countsByCategory' => ['Alumbrado' => 12],
            'topCities' => [['city' => 'Distrito Centro', 'count' => 8, 'pct' => 67]],
            'monthlyTrend' => ['months' => ['Jul 2026'], 'registered' => [12], 'resolved' => [7], 'pending' => [5]],
            'summaryRows' => [['category' => 'Alumbrado', 'total' => 12, 'pending' => 5, 'resolved' => 7, 'resolution_rate' => 58]],
        ];
    }
}
