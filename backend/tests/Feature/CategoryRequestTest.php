<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Catalogs\Infrastructure\Persistence\Models\CategoryRequest;
use App\Incidents\Domain\Enums\IncidentClassificationStatus;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $supervisor;

    private Incident $incident;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            CategorySeeder::class,
            StateSeeder::class,
            PrioritySeeder::class,
            TerritorialUnitSeeder::class,
        ]);

        $this->admin = $this->userWithRole('ADMIN', [
            'two_factor_confirmed_at' => now(),
        ]);
        $this->supervisor = $this->userWithRole('SUPERVISOR');
        $this->incident = $this->pendingIncident();
    }

    public function test_supervisor_can_request_category_and_subcategory_for_unclassified_incident(): void
    {
        $response = $this->actingAs($this->supervisor, 'sanctum')
            ->postJson("/api/incidents/{$this->incident->id}/category-requests", [
                'suggested_category_name' => 'Infraestructura de gas',
                'suggested_category_description' => 'Incidencias relacionadas con redes y suministro de gas.',
                'suggested_subcategory_name' => 'Fuga en red domiciliaria',
                'reason' => 'El catálogo actual no cubre daños o fugas en redes de gas.',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.suggestedCategoryName', 'Infraestructura de gas')
            ->assertJsonPath(
                'data.suggestedCategoryDescription',
                'Incidencias relacionadas con redes y suministro de gas.'
            )
            ->assertJsonPath('data.suggestedSubcategoryName', 'Fuga en red domiciliaria')
            ->assertJsonPath('data.incidentCode', $this->incident->code);

        $this->assertDatabaseHas('core.category_requests', [
            'incident_id' => $this->incident->id,
            'requested_by' => $this->supervisor->id,
            'suggested_name' => 'Infraestructura de gas',
            'suggested_category_description' => 'Incidencias relacionadas con redes y suministro de gas.',
            'suggested_subcategory_name' => 'Fuga en red domiciliaria',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $this->admin->id,
            'incident_id' => $this->incident->id,
            'title' => 'Nueva solicitud de categoría y subtipo',
            'type' => 'CATEGORY_REQUEST',
        ]);
    }

    public function test_request_requires_catalog_levels_category_description_and_a_meaningful_reason(): void
    {
        $this->actingAs($this->supervisor, 'sanctum')
            ->postJson("/api/incidents/{$this->incident->id}/category-requests", [
                'suggested_category_name' => 'Gas',
                'reason' => 'Corto',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'suggested_category_description',
                'suggested_subcategory_name',
                'reason',
            ]);
    }

    public function test_only_supervisor_can_submit_category_request(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/incidents/{$this->incident->id}/category-requests", [
                'suggested_category_name' => 'Infraestructura de gas',
                'suggested_subcategory_name' => 'Fuga domiciliaria',
                'reason' => 'El administrador debe crear el catálogo, no solicitarlo.',
            ])
            ->assertForbidden();
    }

    public function test_incident_can_only_have_one_pending_category_request(): void
    {
        $this->createPendingRequest();

        $this->actingAs($this->supervisor, 'sanctum')
            ->postJson("/api/incidents/{$this->incident->id}/category-requests", [
                'suggested_category_name' => 'Nueva categoría',
                'suggested_category_description' => 'Categoría para incidencias que todavía no cubre el catálogo.',
                'suggested_subcategory_name' => 'Nuevo subtipo',
                'reason' => 'Esta es otra solicitud para la misma incidencia pendiente.',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Ya existe una solicitud de categoría pendiente para esta incidencia.');

        $this->assertDatabaseCount('core.category_requests', 1);
    }

    public function test_classified_incident_cannot_request_new_catalog_entries(): void
    {
        $this->incident->forceFill([
            'classification_status' => IncidentClassificationStatus::Classified->value,
        ])->saveQuietly();

        $this->actingAs($this->supervisor, 'sanctum')
            ->postJson("/api/incidents/{$this->incident->id}/category-requests", [
                'suggested_category_name' => 'Nueva categoría',
                'suggested_category_description' => 'Categoría para incidencias que todavía no cubre el catálogo.',
                'suggested_subcategory_name' => 'Nuevo subtipo',
                'reason' => 'La incidencia ya fue clasificada y no debe aceptar solicitudes.',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'La incidencia ya tiene una clasificación definitiva.');
    }

    public function test_only_admin_with_catalog_permission_can_review_requests(): void
    {
        $request = $this->createPendingRequest();

        $this->actingAs($this->supervisor, 'sanctum')
            ->getJson('/api/admin/catalogs/category-requests')
            ->assertForbidden();

        $this->actingAs($this->supervisor, 'sanctum')
            ->putJson("/api/admin/catalogs/category-requests/{$request->id}/approve", $this->approvalPayload())
            ->assertForbidden();
    }

    public function test_admin_can_list_pending_requests_with_incident_context(): void
    {
        $this->createPendingRequest();

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/admin/catalogs/category-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.incidentCode', $this->incident->code)
            ->assertJsonPath('data.0.requestedByName', $this->supervisor->nombre_completo)
            ->assertJsonPath(
                'data.0.suggestedCategoryDescription',
                'Incidencias relacionadas con redes y suministro de gas.'
            )
            ->assertJsonPath('data.0.suggestedSubcategoryName', 'Fuga en red domiciliaria');
    }

    public function test_admin_approval_creates_catalog_pair_and_classifies_origin_incident(): void
    {
        $request = $this->createPendingRequest();
        $approval = $this->approvalPayload();
        $approval['category_name'] = '  Servicios   de gas  ';
        $approval['subcategory_name'] = '  Fuga en   conexión domiciliaria  ';

        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson(
                "/api/admin/catalogs/category-requests/{$request->id}/approve",
                $approval
            );

        $response->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $category = Category::where('name', 'Servicios de gas')->firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)
            ->where('name', 'Fuga en conexión domiciliaria')
            ->firstOrFail();

        $this->assertDatabaseHas('core.category_requests', [
            'id' => $request->id,
            'status' => 'approved',
            'resolved_by' => $this->admin->id,
            'created_category_id' => $category->id,
            'created_subcategory_id' => $subcategory->id,
        ]);
        $this->assertDatabaseHas('core.incidents', [
            'id' => $this->incident->id,
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'classification_status' => IncidentClassificationStatus::Classified->value,
            'classified_by' => $this->admin->id,
        ]);
        $this->assertDatabaseHas('core.incident_classification_history', [
            'incident_id' => $this->incident->id,
            'new_category_id' => $category->id,
            'new_subcategory_id' => $subcategory->id,
            'changed_by' => $this->admin->id,
        ]);
        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $this->supervisor->id,
            'incident_id' => $this->incident->id,
            'title' => 'Solicitud de clasificación aprobada',
        ]);
    }

    public function test_approval_is_atomic_when_incident_was_already_classified(): void
    {
        $request = $this->createPendingRequest();
        $this->incident->forceFill([
            'classification_status' => IncidentClassificationStatus::Classified->value,
        ])->saveQuietly();

        $this->actingAs($this->admin, 'sanctum')
            ->putJson(
                "/api/admin/catalogs/category-requests/{$request->id}/approve",
                $this->approvalPayload()
            )
            ->assertUnprocessable();

        $this->assertDatabaseMissing('core.categories', ['name' => 'Infraestructura de gas']);
        $this->assertDatabaseHas('core.category_requests', [
            'id' => $request->id,
            'status' => 'pending',
        ]);
    }

    public function test_admin_can_reject_request_with_required_comment(): void
    {
        $request = $this->createPendingRequest();

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/admin/catalogs/category-requests/{$request->id}/reject", [
                'comment' => 'La categoría propuesta duplica un concepto existente.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('core.category_requests', [
            'id' => $request->id,
            'status' => 'rejected',
            'resolved_by' => $this->admin->id,
            'admin_comment' => 'La categoría propuesta duplica un concepto existente.',
        ]);
    }

    private function userWithRole(string $roleCode, array $attributes = []): User
    {
        $user = User::factory()->create([
            'is_active' => true,
            ...$attributes,
        ]);
        $role = Role::where('code', $roleCode)->firstOrFail();
        $user->roles()->attach($role->id);
        $user->load('roles.permissions');

        return $user;
    }

    private function pendingIncident(): Incident
    {
        return Incident::create([
            'code' => 'INC-TEST-001',
            'title' => 'Fuga no cubierta',
            'description' => 'Posible fuga en una red que no existe en el catálogo.',
            'category_id' => Category::where('is_fallback', true)->firstOrFail()->id,
            'subcategory_id' => null,
            'state_id' => State::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'territorial_unit_id' => TerritorialUnit::firstOrFail()->id,
            'reported_by_id' => $this->supervisor->id,
            'latitude' => 0,
            'longitude' => 0,
            'classification_status' => IncidentClassificationStatus::Pending->value,
            'classification_detail' => 'El catálogo actual no cubre redes de gas.',
        ]);
    }

    private function createPendingRequest(): CategoryRequest
    {
        return CategoryRequest::create([
            'incident_id' => $this->incident->id,
            'requested_by' => $this->supervisor->id,
            'suggested_name' => 'Infraestructura de gas',
            'suggested_category_description' => 'Incidencias relacionadas con redes y suministro de gas.',
            'suggested_subcategory_name' => 'Fuga en red domiciliaria',
            'reason' => 'El catálogo actual no cubre daños o fugas en redes de gas.',
            'status' => 'pending',
        ]);
    }

    private function approvalPayload(): array
    {
        return [
            'category_name' => 'Infraestructura de gas',
            'subcategory_name' => 'Fuga en red domiciliaria',
            'category_description' => 'Incidencias relacionadas con redes y suministro de gas.',
            'subcategory_description' => 'Fugas detectadas en conexiones o redes domiciliarias.',
            'icon' => 'fa-fire',
            'color' => '#dc3545',
            'admin_comment' => 'Clasificación revisada y creada desde la solicitud.',
        ];
    }
}
