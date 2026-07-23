<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
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
