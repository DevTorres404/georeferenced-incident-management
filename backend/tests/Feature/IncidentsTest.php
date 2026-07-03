<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Database\Seeders\OperationalZoneGeometrySeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IncidentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_citizen_can_create_incident_and_view_detail(): void
    {
        $this->seedCoreData();
        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-create@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $createResponse = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Bache grande frente al parque',
                'description' => 'La vÃ­a tiene un hueco peligroso.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
                'address' => 'Av. Central y Calle 10',
                'latitude' => -2.1709,
                'longitude' => -79.9224,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.title', 'Bache grande frente al parque');

        $incidentId = $createResponse->json('data.id');
        $this->assertNull(Incident::findOrFail($incidentId)->priority_id);

        $showResponse = $this->actingAsUser($citizen['user'])
            ->getJson("/api/incidents/{$incidentId}");

        $showResponse->assertOk()
            ->assertJsonPath('data.title', 'Bache grande frente al parque')
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'code',
                    'state',
                    'category',
                    'subcategory',
                    'priority',
                    'territorial_unit',
                    'history',
                    'comments',
                    'attachments',
                    'assignments',
                ],
            ]);
    }

    public function test_spatial_zone_resolution_notifies_supervisor_of_coordinate_zone_even_if_territory_differs(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-spatial-zone@incidencias.local');
        $guayasSupervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-guayas-spatial@incidencias.local');
        $sierraSupervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-sierra-spatial@incidencias.local');

        $this->assignUserToZone($guayasSupervisor['user']->id, 'Guayas');
        $this->assignUserToZone($sierraSupervisor['user']->id, 'Sierra Norte / Centro');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $pichinchaParishId = $this->parishIdForProvince('Pichincha');

        $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia espacial Guayaquil',
                'description' => 'Debe resolver la zona Guayas por coordenadas.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $pichinchaParishId,
                'latitude' => -2.1709,
                'longitude' => -79.9224,
            ])->assertCreated();

        $this->assertTrue(
            Notification::where('user_id', $guayasSupervisor['user']->id)
                ->where('title', 'Nueva incidencia creada')
                ->exists()
        );

        $this->assertFalse(
            Notification::where('user_id', $sierraSupervisor['user']->id)
                ->where('title', 'Nueva incidencia creada')
                ->exists()
        );
    }

    public function test_citizen_cannot_assign_priority_or_state_when_creating_incident(): void
    {
        $this->seedCoreData();
        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-no-priority@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $priority = Priority::firstOrFail();
        $state = State::where('name', 'EN_REVISION')->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $basePayload = [
            'title' => 'Poste inclinado',
            'description' => 'El poste se encuentra inclinado y representa peligro para peatones.',
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'territorial_unit_id' => $territorialUnitId,
        ];

        $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                ...$basePayload,
                'priority_id' => $priority->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['priority_id']);

        $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                ...$basePayload,
                'state_id' => $state->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['state_id']);

        $this->assertDatabaseMissing('core.incidents', [
            'title' => 'Poste inclinado',
        ]);
    }

    public function test_citizen_can_create_incident_and_upload_photo_evidence(): void
    {
        config(['filesystems.incident_disk' => 'public']);
        Storage::fake('public');
        $this->seedCoreData();
        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-evidence@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $createResponse = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Alcantarilla abierta',
                'description' => 'La alcantarilla esta abierta y representa riesgo para peatones.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
                'address_reference' => 'Cerca del parque central',
                'latitude' => -2.1709,
                'longitude' => -79.9224,
            ]);

        $createResponse->assertCreated();

        $incidentId = $createResponse->json('data.id');
        $file = UploadedFile::fake()->create('evidencia.png', 128, 'image/png');

        $attachmentResponse = $this->actingAsUser($citizen['user'])
            ->postJson("/api/incidents/{$incidentId}/attachments", [
                'file' => $file,
            ]);

        $attachmentResponse->assertCreated()
            ->assertJsonPath('data.original_name', 'evidencia.png');

        $path = $attachmentResponse->json('data.file_path');
        Storage::disk('public')->assertExists($path);
        $this->assertDatabaseHas('core.incident_attachments', [
            'incident_id' => $incidentId,
            'user_id' => $citizen['user']->id,
            'original_name' => 'evidencia.png',
        ]);
    }

    public function test_admin_can_define_priority_when_creating_incident(): void
    {
        $this->seedCoreData();
        $admin = $this->authenticateAs('ADMIN', 'admin-priority@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $priority = Priority::where('name', 'Alta')->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $response = $this->actingAsUser($admin['user'])
            ->postJson('/api/incidents', [
                'title' => 'Riesgo electrico',
                'description' => 'Cable expuesto cerca de una zona peatonal con alto transito.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'territorial_unit_id' => $territorialUnitId,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.title', 'Riesgo electrico');

        $this->assertDatabaseHas('core.incidents', [
            'id' => $response->json('data.id'),
            'priority_id' => $priority->id,
        ]);
    }

    public function test_incident_lifecycle_generates_comments_state_changes_and_notifications(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-flow@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-flow@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-flow@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'SemÃ¡foro apagado',
                'description' => 'El semÃ¡foro dejÃ³ de funcionar.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        $this->actingAsUser($citizen['user'])
            ->postJson("/api/incidents/{$incidentId}/comments", [
                'comment' => 'Ocurre desde anoche.',
                'is_internal' => false,
            ])->assertCreated()
            ->assertJsonPath('data.comment', 'Ocurre desde anoche.');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated()
            ->assertJsonPath('data.current_assignee_user_id', $operator['user']->id);

        $reviewState = State::where('name', 'EN_REVISION')->firstOrFail();

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incidentId}/state", [
                'state_id' => $reviewState->id,
                'comment' => 'Validado por supervisor.',
            ])->assertOk()
            ->assertJsonPath('data.state_id', $reviewState->id);

        $operatorNotifications = $this->actingAsUser($operator['user'])
            ->getJson('/api/notifications');

        $operatorNotifications->assertOk()
            ->assertJsonStructure(['data', 'meta']);
        $this->assertTrue(
            $this->userHasNotification($operator['user'], 'Incidencia asignada', 'responsable principal')
        );

        $citizenNotifications = $this->actingAsUser($citizen['user'])
            ->getJson('/api/notifications');

        $citizenNotifications->assertOk();
        $this->assertGreaterThan(0, count($citizenNotifications->json('data')));

        $notificationId = $citizenNotifications->json('data.0.id');

        $this->actingAsUser($citizen['user'])
            ->patchJson("/api/notifications/{$notificationId}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $detailResponse = $this->actingAsUser($citizen['user'])
            ->getJson("/api/incidents/{$incidentId}");

        $detailResponse->assertOk();
        $this->assertNotEmpty($detailResponse->json('data.comments'));
        $this->assertNotEmpty($detailResponse->json('data.assignments'));
        $this->assertGreaterThanOrEqual(2, count($detailResponse->json('data.history')));
    }

    public function test_operator_receives_reassignment_and_priority_change_notifications(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-operator-alerts@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-operator-alerts@incidencias.local');
        $operatorOne = $this->authenticateAs('OPERADOR', 'operator-one-alerts@incidencias.local');
        $operatorTwo = $this->authenticateAs('OPERADOR', 'operator-two-alerts@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $priority = Priority::where('name', 'Alta')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Cable suelto',
                'description' => 'Cable colgando sobre la acera principal.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operatorOne['user']->id,
            ])->assertCreated();

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operatorTwo['user']->id,
            ])->assertCreated();

        $this->assertFalse(
            $this->userHasNotification($operatorOne['user'], 'Incidencia reasignada', 'fue reasignada a otro operador')
        );

        $this->actingAsUser($admin['user'])
            ->putJson("/api/incidents/{$incidentId}", [
                'priority_id' => $priority->id,
            ])->assertOk();

        $this->assertTrue(
            $this->userHasNotification($operatorTwo['user'], 'Cambio de prioridad', 'cambiÃ³ a Alta')
        );
    }

    public function test_assignment_is_blocked_when_operator_exceeds_workload_points(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-workload-limit@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-workload-limit@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-workload-limit@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $highPriority = Priority::where('name', 'Alta')->firstOrFail();
        $criticalPriority = Priority::where('level', 1)->firstOrFail();
        $activeState = State::where('name', 'EN_PROGRESO')->firstOrFail();

        OperatorProfile::query()->where('user_id', $operator['user']->id)->update([
            'max_active_incidents' => 10,
            'max_workload_points' => 20,
            'active' => true,
        ]);

        for ($index = 1; $index <= 6; $index++) {
            $incident = Incident::create([
                'code' => sprintf('INC-WORK-%02d', $index),
                'title' => "Carga alta {$index}",
                'description' => 'Incidencia de carga alta.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $highPriority->id,
                'state_id' => $activeState->id,
                'territorial_unit_id' => $territorialUnitId,
                'reported_by_id' => $citizen['user']->id,
            ]);
            $this->assignIncidentToOperator($incident, $operator['user']->id, $admin['user']->id);
        }

        $newIncidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia critica para bloqueo',
                'description' => 'Debe bloquearse por puntos de carga.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->assertCreated()
            ->json('data.id');

        Incident::whereKey($newIncidentId)->update([
            'priority_id' => $criticalPriority->id,
            'state_id' => $activeState->id,
        ]);

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$newIncidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertStatus(422)
            ->assertJsonPath('message', 'El operador ya alcanzo su capacidad maxima de incidencias activas o puntos de carga.');
    }

    public function test_assignment_ignores_resolved_incidents_when_computing_operator_load(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-workload-resolved@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-workload-resolved@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-workload-resolved@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $criticalPriority = Priority::where('level', 1)->firstOrFail();
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();
        $activeState = State::where('name', 'EN_PROGRESO')->firstOrFail();

        OperatorProfile::query()->where('user_id', $operator['user']->id)->update([
            'max_active_incidents' => 1,
            'max_workload_points' => 5,
            'active' => true,
        ]);

        $resolvedIncident = Incident::create([
            'code' => 'INC-RESOLVED-LOAD',
            'title' => 'Incidencia resuelta',
            'description' => 'No debe contar como carga activa.',
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'priority_id' => $criticalPriority->id,
            'state_id' => $resolvedState->id,
            'territorial_unit_id' => $territorialUnitId,
            'reported_by_id' => $citizen['user']->id,
        ]);
        $this->assignIncidentToOperator($resolvedIncident, $operator['user']->id, $admin['user']->id);

        $newIncidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Nueva incidencia valida',
                'description' => 'Debe poder asignarse.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->assertCreated()
            ->json('data.id');

        Incident::whereKey($newIncidentId)->update([
            'priority_id' => $criticalPriority->id,
            'state_id' => $activeState->id,
        ]);

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$newIncidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated()
            ->assertJsonPath('data.current_assignee_user_id', $operator['user']->id);
    }

    public function test_operator_cannot_assign_priority_when_updating_incident(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-no-update-priority@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-no-update-priority@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-no-update-priority@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $priority = Priority::where('name', 'Alta')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Arbol caido',
                'description' => 'Se requiere validacion de prioridad.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated();

        $this->actingAsUser($operator['user'])
            ->putJson("/api/incidents/{$incidentId}", [
                'priority_id' => $priority->id,
            ])->assertUnprocessable()
            ->assertJsonValidationErrors(['priority_id']);

        $this->assertDatabaseHas('core.incidents', [
            'id' => $incidentId,
            'priority_id' => null,
        ]);
    }

    public function test_operator_alert_command_notifies_unreviewed_and_near_due_incidents(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-command-alerts@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-command-alerts@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-command-alerts@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $unreviewedIncidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Luminaria apagada',
                'description' => 'Luminaria apagada desde hace varias horas.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        Incident::whereKey($unreviewedIncidentId)->update([
            'created_at' => now()->subMinutes(31),
            'current_assigned_id' => null,
        ]);

        $nearDueIncidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Semaforo intermitente',
                'description' => 'Semaforo intermitente en interseccion principal.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$nearDueIncidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated();

        Incident::whereKey($nearDueIncidentId)->update([
            'due_date' => now()->addMinutes(30),
        ]);

        $this->artisan('incidents:notify-operators')
            ->assertExitCode(0);

        $unreviewedCode = Incident::findOrFail($unreviewedIncidentId)->code;
        $nearDueCode = Incident::findOrFail($nearDueIncidentId)->code;

        $this->assertTrue(
            $this->userHasNotification($operator['user'], 'Incidencia sin atender', "La incidencia {$unreviewedCode} lleva 30 minutos sin revisiÃ³n.")
        );
        $this->assertTrue(
            $this->userHasNotification($operator['user'], 'Incidencia prÃ³xima a vencer', "La incidencia {$nearDueCode} estÃ¡ cerca de superar el tiempo de atenciÃ³n.")
        );
    }

    public function test_supervisor_receives_immediate_control_notifications(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-supervisor-alerts@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-supervisor-alerts@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-supervisor-alerts@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-alerts@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $criticalPriority = Priority::where('level', 1)->firstOrFail();
        $highPriority = Priority::where('name', 'Alta')->firstOrFail();

        $criticalIncidentId = $this->actingAsUser($admin['user'])
            ->postJson('/api/incidents', [
                'title' => 'Riesgo critico',
                'description' => 'Incidencia critica que requiere control inmediato.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $criticalPriority->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->assertCreated()
            ->json('data.id');

        $operatorIncidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Poste con falla',
                'description' => 'Poste con falla para validar prioridad manual.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$operatorIncidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated();

        $this->actingAsUser($admin['user'])
            ->putJson("/api/incidents/{$operatorIncidentId}", [
                'priority_id' => $highPriority->id,
            ])->assertOk();

        $rejectedState = State::where('name', 'RECHAZADA')->firstOrFail();

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$criticalIncidentId}/state", [
                'state_id' => $rejectedState->id,
                'comment' => 'Fuera de cobertura.',
            ])->assertOk();

        $this->assertGreaterThan(
            0,
            Notification::where('user_id', $supervisor['user']->id)->count()
        );
    }
public function test_supervisor_alert_command_notifies_control_and_summary_events(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-supervisor-command@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-supervisor-command@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-command@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $priority = Priority::where('name', 'Baja')->firstOrFail();
        $state = State::where('name', 'NUEVA')->firstOrFail();

        $overdueIncident = Incident::create([
            'code' => 'INC-SUP-OVERDUE',
            'title' => 'SLA vencido',
            'description' => 'Incidencia vencida para supervisor.',
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'priority_id' => $priority->id,
            'state_id' => $state->id,
            'territorial_unit_id' => $territorialUnitId,
            'reported_by_id' => $citizen['user']->id,
        ]);
        $overdueIncident->forceFill(['due_date' => now()->subHour()])->save();

        $stalledIncident = Incident::create([
            'code' => 'INC-SUP-STALLED',
            'title' => 'Sin avance',
            'description' => 'Incidencia asignada sin avance.',
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'priority_id' => $priority->id,
            'state_id' => $state->id,
            'territorial_unit_id' => $territorialUnitId,
            'reported_by_id' => $citizen['user']->id,
        ]);
        $this->assignIncidentToOperator($stalledIncident, $operator['user']->id, $supervisor['user']->id);
        $stalledIncident->forceFill([
            'updated_at' => now()->subMinutes(45),
        ])->save();

        for ($i = 1; $i <= 10; $i++) {
            $loadIncident = Incident::create([
                'code' => sprintf('INC-SUP-LOAD-%02d', $i),
                'title' => "Carga alta {$i}",
                'description' => 'Incidencia para validar carga alta.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'state_id' => $state->id,
                'territorial_unit_id' => $territorialUnitId,
                'reported_by_id' => $citizen['user']->id,
            ]);
            $this->assignIncidentToOperator($loadIncident, $operator['user']->id, $supervisor['user']->id);
        }

        $this->artisan('incidents:notify-supervisors')
            ->assertExitCode(0);

        $this->assertTrue(
            $this->userHasNotification($supervisor['user'], 'Incidencia vencida por SLA', $overdueIncident->code)
        );
        $this->assertTrue(
            $this->userHasNotification($supervisor['user'], 'Operador no atiende incidencia', $stalledIncident->code)
        );
        $this->assertTrue(
            $this->userHasNotification($supervisor['user'], 'Muchas incidencias en una zona', 'reportes similares')
        );
        $this->assertTrue(
            $this->userHasNotification($supervisor['user'], 'Reporte diario', 'Resumen')
        );
        $this->assertTrue(
            $this->userHasNotification($supervisor['user'], 'Carga alta de operadores', 'demasiadas incidencias asignadas')
        );
    }

    public function test_admin_can_filter_incidents_by_status_and_category(): void
    {
        $this->seedCoreData();
        $admin = $this->authenticateAs('ADMIN', 'admin-filter@incidencias.local');

        $state = State::firstOrFail();
        $category = Category::firstOrFail();

        $response = $this->actingAsUser($admin['user'])
            ->getJson("/api/incidents?state_id={$state->id}&category_id={$category->id}");

        $response->assertOk()
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_operator_can_create_internal_comment_and_citizen_cannot_view_it(): void
    {
        $this->seedCoreData();
        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-comment@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-comment@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-comment@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Fuga de agua',
                'description' => 'Tuberia rota.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        // Admin assigns operator
        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated();

        // Operator leaves an internal comment
        $this->actingAsUser($operator['user'])
            ->postJson("/api/incidents/{$incidentId}/comments", [
                'comment' => 'Parece ser una falla mayor.',
                'is_internal' => true,
            ])->assertCreated();

        // Citizen checks details, should not see the internal comment
        $citizenResponse = $this->actingAsUser($citizen['user'])
            ->getJson("/api/incidents/{$incidentId}");

        $citizenComments = $citizenResponse->json('data.comments');
        $this->assertEmpty($citizenComments);

        // Operator checks details, should see the internal comment
        $operatorResponse = $this->actingAsUser($operator['user'])
            ->getJson("/api/incidents/{$incidentId}");

        $operatorComments = $operatorResponse->json('data.comments');
        $this->assertCount(1, $operatorComments);
        $this->assertTrue($operatorComments[0]['is_internal']);
    }

    public function test_citizen_cannot_create_internal_comments(): void
    {
        $this->seedCoreData();
        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-bad-comment@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Corte electrico',
                'description' => 'No hay luz.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
            ])->json('data.id');

        // Citizen attempts to leave an internal comment
        $this->actingAsUser($citizen['user'])
            ->postJson("/api/incidents/{$incidentId}/comments", [
                'comment' => 'Mensaje secreto',
                'is_internal' => true,
            ])->assertForbidden();
    }

    private function seedCoreData(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            StateSeeder::class,
            PrioritySeeder::class,
            CategorySeeder::class,
            TerritorialUnitSeeder::class,
            OperationalZoneGeometrySeeder::class,
        ]);
    }

    private function territorialUnitId(): int
    {
        return (int) TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PARISH)
            ->value('id');
    }

    private function parishIdForProvince(string $provinceName): int
    {
        $province = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PROVINCE)
            ->where('name', $provinceName)
            ->firstOrFail();

        $canton = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_CANTON)
            ->where('parent_id', $province->id)
            ->orderBy('name')
            ->firstOrFail();

        return (int) TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PARISH)
            ->where('parent_id', $canton->id)
            ->orderBy('name')
            ->value('id');
    }

    /**
     * @return array{user: User}
     */
    private function authenticateAs(string $roleCode, string $email): array
    {
        $user = User::factory()->create([
            'email' => $email,
            'two_factor_confirmed_at' => now(),
        ]);
        $role = Role::where('code', $roleCode)->firstOrFail();
        $role->permissions()->syncWithoutDetaching(
            $this->permissionCodesForRole($roleCode)
        );
        $user->roles()->sync([$role->id]);

        if ($roleCode === 'OPERADOR') {
            OperatorProfile::query()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'incident_capacity' => 10,
                    'max_active_incidents' => 10,
                    'max_workload_points' => 20,
                    'active' => true,
                ]
            );
        }

        if (in_array($roleCode, ['SUPERVISOR', 'OPERADOR'], true)) {
            $zoneId = $this->defaultOperationalZoneId();

            if ($zoneId > 0) {
                UserTerritory::query()->updateOrCreate(
                    [
                        'user_id' => $user->id,
                        'territorial_unit_id' => $zoneId,
                    ],
                    [
                        'assigned_by' => $user->id,
                        'assigned_at' => now(),
                        'unassigned_at' => null,
                        'is_active' => true,
                    ]
                );
            }
        }

        return [
            'user' => $user,
        ];
    }

    private function actingAsUser(User $user): self
    {
        Sanctum::actingAs($user->fresh(), ['*']);

        return $this;
    }

    private function userHasNotification(User $user, string $title, string $messageFragment): bool
    {
        if (Notification::where('user_id', $user->id)
            ->where('title', $title)
            ->where('message', 'ILIKE', "%{$messageFragment}%")
            ->exists()) {
            return true;
        }

        return Notification::where('user_id', $user->id)
            ->get()
            ->contains(function (Notification $notification) use ($title, $messageFragment): bool {
                return $this->containsSearchTerms($notification->title, $title)
                    && $this->containsSearchTerms($notification->message, $messageFragment);
            });
    }

    private function containsSearchTerms(string $actual, string $expected): bool
    {
        $actual = $this->normalizeSearchText($actual);
        $expected = $this->normalizeSearchText($expected);
        $terms = array_filter(
            preg_split('/\s+/', $expected) ?: [],
            fn (string $term): bool => strlen($term) >= 3 && preg_match('/^[a-z0-9-]+$/', $term) === 1
        );

        foreach ($terms as $term) {
            if (! str_contains($actual, $term)) {
                return false;
            }
        }

        return $terms !== [];
    }

    private function normalizeSearchText(string $value): string
    {
        $normalized = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);

        return strtolower($normalized !== false ? $normalized : $value);
    }

    /**
     * @return array<int, int>
     */
    private function permissionCodesForRole(string $roleCode): array
    {
        $codes = match ($roleCode) {
            'ADMIN' => Permission::query()->pluck('id')->all(),
            'OPERADOR' => Permission::whereIn('code', [
                'incidents.view',
                'incidents.edit',
                'comments.create',
                'comments.internal',
            ])->pluck('id')->all(),
            'CIUDADANO' => Permission::whereIn('code', [
                'incidents.view',
                'incidents.create',
                'comments.create',
            ])->pluck('id')->all(),
            default => Permission::whereIn('code', [
                'incidents.view',
                'incidents.create',
                'incidents.edit',
                'incidents.assign',
                'incidents.close',
                'incidents.reopen',
                'comments.create',
                'comments.internal',
            ])->pluck('id')->all(),
        };

        return array_map('intval', $codes);
    }

    private function assignIncidentToOperator(Incident $incident, int $operatorUserId, int $assignedByUserId): void
    {
        $incident->forceFill(['current_assigned_id' => $operatorUserId])->save();

        IncidentAssignment::query()->create([
            'incident_id' => $incident->id,
            'user_id' => $operatorUserId,
            'assigned_by_id' => $assignedByUserId,
            'assignment_role' => 'primary',
            'active' => true,
        ]);
    }

    private function assignUserToZone(int $userId, string $zoneName): void
    {
        UserTerritory::query()
            ->where('user_id', $userId)
            ->update([
                'is_active' => false,
                'unassigned_at' => now(),
            ]);

        $zoneId = (int) TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->where('name', $zoneName)
            ->value('id');

        UserTerritory::query()->create([
            'user_id' => $userId,
            'territorial_unit_id' => $zoneId,
            'assigned_by' => $userId,
            'assigned_at' => now(),
            'unassigned_at' => null,
            'is_active' => true,
        ]);
    }

    private function defaultOperationalZoneId(): int
    {
        $territory = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PARISH)
            ->with(TerritorialUnit::PARENT_CHAIN)
            ->first();

        while ($territory && $territory->parent) {
            $territory = $territory->parent;

            if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return (int) $territory->id;
            }
        }

        return 0;
    }
}





