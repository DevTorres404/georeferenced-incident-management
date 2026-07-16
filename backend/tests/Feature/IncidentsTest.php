<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\UseCases\IncidentUseCase;
use App\Incidents\Domain\Entities\Incident as IncidentEntity;
use App\Incidents\Domain\Entities\IncidentState as IncidentStateEntity;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Infrastructure\Broadcasting\CommentCreated;
use App\Incidents\Infrastructure\Broadcasting\IncidentStateChanged;
use App\Incidents\Infrastructure\Jobs\NotifyIncidentCreatedJob;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateChangeRequest;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Application\Ports\FileStoragePort;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\CategorySeeder;
use Database\Seeders\OperationalZoneGeometrySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class IncidentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_without_confirmed_2fa_cannot_authorize_incident_realtime_channels(): void
    {
        $this->seedCoreData();
        $admin = $this->authenticateAs('ADMIN', 'admin-realtime-2fa@incidencias.local')['user'];
        $admin->forceFill(['two_factor_confirmed_at' => null])->save();

        $incident = Incident::create([
            'code' => 'INC-2FA-001',
            'title' => 'Incidencia para canal privado',
            'description' => 'Valida la autorizacion 2FA de canales.',
            'category_id' => Category::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => State::firstOrFail()->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $admin->id,
        ]);

        foreach (['state', 'assignments'] as $channel) {
            $this->actingAsUser($admin)
                ->postJson('/broadcasting/auth', [
                    'channel_name' => "private-incidents.{$incident->id}.{$channel}",
                    'socket_id' => '1234.5678',
                ])
                ->assertForbidden()
                ->assertJsonPath('requires_2fa_setup', true);
        }
    }

    public function test_citizen_can_create_incident_and_view_detail(): void
    {
        Bus::fake([NotifyIncidentCreatedJob::class]);
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
        Bus::assertDispatched(NotifyIncidentCreatedJob::class, function (NotifyIncidentCreatedJob $job) use ($incidentId): bool {
            return $job->incidentId === (int) $incidentId;
        });

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

    public function test_citizen_cannot_view_another_citizens_incident_by_id(): void
    {
        Bus::fake([NotifyIncidentCreatedJob::class]);
        $this->seedCoreData();

        $owner = $this->authenticateAs('CIUDADANO', 'incident-owner@incidencias.local');
        $otherCitizen = $this->authenticateAs('CIUDADANO', 'other-citizen@incidencias.local');
        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();

        $incidentId = $this->actingAsUser($owner['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia privada del reportante',
                'description' => 'Solo el ciudadano que reporto debe poder consultar este detalle.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $this->territorialUnitId(),
            ])
            ->assertCreated()
            ->json('data.id');

        $this->actingAsUser($otherCitizen['user'])
            ->getJson("/api/incidents/{$incidentId}")
            ->assertForbidden();
    }

    public function test_operator_cannot_change_state_of_an_unassigned_incident(): void
    {
        Bus::fake([NotifyIncidentCreatedJob::class]);
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'state-owner@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'unassigned-operator@incidencias.local');
        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $state = State::where('name', 'EN_REVISION')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia sin operador',
                'description' => 'No debe aceptar cambios de un operador que no esta asignado.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $this->territorialUnitId(),
            ])
            ->assertCreated()
            ->json('data.id');

        $this->actingAsUser($operator['user'])
            ->patchJson("/api/incidents/{$incidentId}/state", ['state_id' => $state->id])
            ->assertForbidden();
    }

    public function test_supervisor_cannot_change_state_outside_assigned_zone(): void
    {
        Bus::fake([NotifyIncidentCreatedJob::class]);
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'zone-state-owner@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'wrong-zone-supervisor@incidencias.local');
        $this->assignUserToZone($supervisor['user']->id, 'Guayas');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $state = State::where('name', 'EN_REVISION')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia fuera de zona',
                'description' => 'La incidencia pertenece a Pichincha y no a la zona Guayas.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $this->parishIdForProvince('Pichincha'),
            ])
            ->assertCreated()
            ->json('data.id');

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incidentId}/state", ['state_id' => $state->id])
            ->assertForbidden();
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
        Event::fake([CommentCreated::class]);
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

        Event::assertDispatched(
            CommentCreated::class,
            fn (CommentCreated $event): bool => $event->comment->incidentId === (int) $incidentId
                && ! $event->comment->isInternal
        );

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated()
            ->assertJsonPath('data.current_assignee_user_id', $operator['user']->id);

        $operatorDetail = $this->actingAsUser($operator['user'])
            ->getJson("/api/incidents/{$incidentId}");

        $operatorDetail->assertOk()
            ->assertJsonPath('data.id', $incidentId)
            ->assertJsonPath('data.comments.0.comment', 'Ocurre desde anoche.')
            ->assertJsonStructure([
                'data' => [
                    'state',
                    'category',
                    'subcategory',
                    'territorial_unit',
                    'history',
                    'comments',
                    'attachments',
                    'assignments',
                ],
            ]);

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
            $this->userHasNotification($operatorTwo['user'], 'Cambio de prioridad', 'cambió a Alta')
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

    public function test_resolved_incident_keeps_operator_capacity_occupied(): void
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
            ])->assertStatus(422)
            ->assertJsonPath('message', 'El operador ya alcanzo su capacidad maxima de incidencias activas o puntos de carga.');
    }

    public function test_closing_incident_releases_primary_and_support_assignments_and_capacity(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-close-release@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-close-release@incidencias.local');
        $primary = $this->authenticateAs('OPERADOR', 'primary-close-release@incidencias.local');
        $support = $this->authenticateAs('OPERADOR', 'support-close-release@incidencias.local');

        $category = Category::firstOrFail();
        $priority = Priority::where('level', 1)->firstOrFail();
        $inProgressState = State::where('name', 'EN_PROGRESO')->firstOrFail();
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();
        $closedState = State::where('name', 'CERRADA')->firstOrFail();

        OperatorProfile::query()
            ->whereIn('user_id', [$primary['user']->id, $support['user']->id])
            ->update(['max_active_incidents' => 1, 'max_workload_points' => 10, 'active' => true]);

        $incident = Incident::create([
            'code' => 'INC-CLOSE-RELEASE',
            'title' => 'Incident ready to close',
            'description' => 'Both assignments must remain through resolution and release on close.',
            'category_id' => $category->id,
            'priority_id' => $priority->id,
            'state_id' => $inProgressState->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $citizen['user']->id,
        ]);

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incident->id}/assignments", [
                'primary_user_id' => $primary['user']->id,
                'support_user_ids' => [$support['user']->id],
            ])->assertCreated();

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $resolvedState->id,
                'comment' => 'Work completed.',
            ])->assertOk();

        $this->assertSame(2, IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->where('active', true)
            ->count());

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $closedState->id,
            ])->assertOk();

        $releasedAssignments = IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->get();
        $this->assertCount(2, $releasedAssignments);
        $this->assertTrue($releasedAssignments->every(
            fn (IncidentAssignment $assignment): bool => ! $assignment->active
                && $assignment->unassignment_date !== null
        ));
        $this->assertNull($incident->fresh()->current_assigned_id);
        foreach ([$primary['user'], $support['user']] as $releasedOperator) {
            $this->assertSame(1, Notification::query()
                ->where('user_id', $releasedOperator->id)
                ->where('incident_id', $incident->id)
                ->where('title', 'Cambio de estado')
                ->where('message', 'ILIKE', '%CERRADA%')
                ->count());
        }

        $nextIncident = Incident::create([
            'code' => 'INC-AFTER-CLOSE',
            'title' => 'Capacity after close',
            'description' => 'The released operator must be immediately assignable.',
            'category_id' => $category->id,
            'priority_id' => $priority->id,
            'state_id' => $inProgressState->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $citizen['user']->id,
        ]);

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$nextIncident->id}/assignments", [
                'user_id' => $primary['user']->id,
            ])->assertCreated();
    }

    public function test_assignment_to_closed_incident_is_rejected(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-closed-assignment@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-closed-assignment@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-closed-assignment@incidencias.local');

        $incident = Incident::create([
            'code' => 'INC-CLOSED-01',
            'title' => 'Closed incident',
            'description' => 'Closed incidents cannot be assigned again.',
            'category_id' => Category::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => State::where('name', 'CERRADA')->firstOrFail()->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $citizen['user']->id,
        ]);

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incident->id}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertStatus(422)
            ->assertJsonPath('message', 'No se pueden asignar operadores a una incidencia cerrada.');
    }

    public function test_admin_can_reopen_closed_incident_without_reactivating_assignments(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-admin-reopen@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-reopen@incidencias.local');
        $primary = $this->authenticateAs('OPERADOR', 'primary-admin-reopen@incidencias.local');
        $support = $this->authenticateAs('OPERADOR', 'support-admin-reopen@incidencias.local');
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();
        $closedState = State::where('name', 'CERRADA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-ADMIN-REOPEN',
            $resolvedState->id,
            $citizen['user']->id
        );

        $this->assignIncidentToOperator($incident, $primary['user']->id, $admin['user']->id);
        IncidentAssignment::query()->create([
            'incident_id' => $incident->id,
            'user_id' => $support['user']->id,
            'assigned_by_id' => $admin['user']->id,
            'assignment_role' => IncidentAssignment::ROLE_SUPPORT,
            'active' => true,
        ]);

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $closedState->id,
            ])->assertOk();

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $reopenedState->id,
                'comment' => 'A new review and assignment are required.',
            ])->assertOk()
            ->assertJsonPath('data.state_id', $reopenedState->id);

        $assignments = IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->get();
        $this->assertCount(2, $assignments);
        $this->assertTrue($assignments->every(
            fn (IncidentAssignment $assignment): bool => ! $assignment->active
                && $assignment->unassignment_date !== null
        ));
        $this->assertNull($incident->fresh()->current_assigned_id);
    }

    public function test_supervisor_can_reopen_closed_incident(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-supervisor-reopen@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-reopen@incidencias.local');
        $closedState = State::where('name', 'CERRADA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-SUP-REOPEN',
            $closedState->id,
            $citizen['user']->id
        );

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $reopenedState->id,
                'comment' => 'Supervisor requested a new review.',
            ])->assertOk()
            ->assertJsonPath('data.state_id', $reopenedState->id);
    }

    public function test_admin_and_supervisor_without_reopen_permission_cannot_reopen_incidents(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-reopen-permission@incidencias.local');
        $closedState = State::where('name', 'CERRADA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $editPermission = Permission::where('code', 'incidents.edit')->firstOrFail();
        $reopenPermission = Permission::where('code', 'incidents.reopen')->firstOrFail();

        foreach (['SUPERVISOR', 'ADMIN'] as $index => $roleCode) {
            $actor = $this->authenticateAs(
                $roleCode,
                strtolower($roleCode).'-without-reopen@incidencias.local'
            );
            $role = $actor['user']->roles()->firstOrFail();
            $role->permissions()->syncWithoutDetaching([$editPermission->id]);
            $role->permissions()->detach($reopenPermission->id);
            $incident = $this->createIncidentInState(
                "INC-NOREOPEN-{$index}",
                $closedState->id,
                $citizen['user']->id
            );
            $historyCount = IncidentState::where('incident_id', $incident->id)->count();
            $notificationCount = Notification::where('incident_id', $incident->id)->count();

            $this->actingAsUser($actor['user'])
                ->patchJson("/api/incidents/{$incident->id}/state", [
                    'state_id' => $reopenedState->id,
                    'comment' => 'This actor lacks the database permission.',
                ])->assertForbidden();

            $this->assertSame($closedState->id, $incident->fresh()->state_id);
            $this->assertSame($historyCount, IncidentState::where('incident_id', $incident->id)->count());
            $this->assertSame($notificationCount, Notification::where('incident_id', $incident->id)->count());
        }
    }

    public function test_admin_and_supervisor_can_reopen_rejected_incidents_and_start_a_new_assignment_workflow(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-rejected-reopen@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-rejected-reopen@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-rejected-reopen@incidencias.local');
        $formerOperator = $this->authenticateAs('OPERADOR', 'former-rejected-reopen@incidencias.local');
        $newOperator = $this->authenticateAs('OPERADOR', 'new-rejected-reopen@incidencias.local');
        $rejectedState = State::where('name', 'RECHAZADA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $reviewState = State::where('name', 'EN_REVISION')->firstOrFail();
        $inProgressState = State::where('name', 'EN_PROGRESO')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-REJECTED-REOPEN',
            $rejectedState->id,
            $citizen['user']->id
        );
        $formerAssignment = IncidentAssignment::query()->create([
            'incident_id' => $incident->id,
            'user_id' => $formerOperator['user']->id,
            'assigned_by_id' => $supervisor['user']->id,
            'assignment_role' => IncidentAssignment::ROLE_PRIMARY,
            'active' => false,
            'unassignment_date' => now()->subDay(),
        ]);

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $reopenedState->id,
                'comment' => 'The rejection requires a new review.',
            ])->assertOk();

        $this->assertFalse($formerAssignment->fresh()->active);
        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $reviewState->id,
            ])->assertOk();
        $this->actingAsUser($supervisor['user'])
            ->postJson("/api/incidents/{$incident->id}/assignments", [
                'user_id' => $newOperator['user']->id,
            ])->assertCreated();
        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $inProgressState->id,
            ])->assertOk()
            ->assertJsonPath('data.state_id', $inProgressState->id);

        $this->assertFalse($formerAssignment->fresh()->active);
        $this->assertDatabaseHas('core.incident_assignments', [
            'incident_id' => $incident->id,
            'user_id' => $newOperator['user']->id,
            'active' => true,
        ]);

        $adminIncident = $this->createIncidentInState(
            'INC-ADMIN-REOPEN-R',
            $rejectedState->id,
            $citizen['user']->id
        );
        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$adminIncident->id}/state", [
                'state_id' => $reopenedState->id,
                'comment' => 'The administrator requires a new review.',
            ])->assertOk()
            ->assertJsonPath('data.state_id', $reopenedState->id);
    }

    public function test_both_reopening_paths_require_a_non_blank_reason_without_mutating_the_incident(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-blank-reopen@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-blank-reopen@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-blank-reopen@incidencias.local');
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $useCase = $this->app->make(IncidentUseCase::class);

        foreach (['CERRADA', 'RECHAZADA'] as $index => $sourceName) {
            $sourceState = State::where('name', $sourceName)->firstOrFail();
            $incident = $this->createIncidentInState(
                "INC-BLANK-REOPEN-{$index}",
                $sourceState->id,
                $citizen['user']->id
            );
            $assignment = IncidentAssignment::query()->create([
                'incident_id' => $incident->id,
                'user_id' => $operator['user']->id,
                'assigned_by_id' => $admin['user']->id,
                'assignment_role' => IncidentAssignment::ROLE_PRIMARY,
                'active' => false,
                'unassignment_date' => now()->subDay(),
            ]);
            $initialHistoryCount = IncidentState::where('incident_id', $incident->id)->count();
            $initialNotificationCount = Notification::where('incident_id', $incident->id)->count();
            $initialAssignment = $assignment->fresh()->getRawOriginal();

            foreach ([
                'missing' => null,
                'empty' => '',
                'whitespace' => " \t\n ",
                'nbsp' => "\u{00A0}",
                'unicode separators' => "\u{2002}\u{2028}",
                'unicode format characters' => "\u{200B}",
            ] as $reason => $comment) {
                try {
                    $useCase->changeState(
                        $incident->id,
                        $admin['user']->id,
                        ['ADMIN'],
                        true,
                        new ChangeStateInputData(stateId: $reopenedState->id, comment: $comment)
                    );

                    $this->fail("The {$sourceName} {$reason} reopening reason should be rejected.");
                } catch (IncidentException $exception) {
                    $this->assertSame('Esta transicion requiere comment.', $exception->getMessage());
                }

                $this->assertSame($sourceState->id, $incident->fresh()->state_id);
                $this->assertSame($initialHistoryCount, IncidentState::where('incident_id', $incident->id)->count());
                $this->assertSame(
                    $initialNotificationCount,
                    Notification::where('incident_id', $incident->id)->count()
                );
                $this->assertSame($initialAssignment, $assignment->fresh()->getRawOriginal());
            }
        }
    }

    public function test_reopening_notification_failure_rolls_back_state_and_history(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-reopen-rollback@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-reopen-rollback@incidencias.local');
        $closedState = State::where('name', 'CERRADA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-REOPEN-ROLLBACK',
            $closedState->id,
            $citizen['user']->id
        );
        $historyCount = IncidentState::where('incident_id', $incident->id)->count();

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION core.fail_incident_notification_insert()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'forced notification persistence failure';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER fail_incident_notification_insert
            BEFORE INSERT ON core.notifications
            FOR EACH ROW EXECUTE FUNCTION core.fail_incident_notification_insert();
            SQL);

        try {
            $this->app->make(IncidentUseCase::class)->changeState(
                $incident->id,
                $admin['user']->id,
                ['ADMIN'],
                true,
                new ChangeStateInputData($reopenedState->id, 'Retry after notification recovery.')
            );
            $this->fail('Notification persistence failure must abort the state change.');
        } catch (QueryException $exception) {
            $this->assertStringContainsString('forced notification persistence failure', $exception->getMessage());
        } finally {
            DB::unprepared('DROP TRIGGER IF EXISTS fail_incident_notification_insert ON core.notifications');
            DB::unprepared('DROP FUNCTION IF EXISTS core.fail_incident_notification_insert()');
        }

        $this->assertSame($closedState->id, $incident->fresh()->state_id);
        $this->assertSame($historyCount, IncidentState::where('incident_id', $incident->id)->count());
        $this->assertSame(0, Notification::where('incident_id', $incident->id)->count());
    }

    public function test_operator_and_citizen_cannot_use_either_reopening_path(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-denied-reopen@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-denied-reopen@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-denied-reopen@incidencias.local');
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();

        $citizenRole = $citizen['user']->roles()->firstOrFail();
        $citizenRole->permissions()->syncWithoutDetaching([
            Permission::where('code', 'incidents.edit')->firstOrFail()->id,
        ]);

        foreach (['CERRADA', 'RECHAZADA'] as $index => $sourceName) {
            $sourceState = State::where('name', $sourceName)->firstOrFail();
            $incident = $this->createIncidentInState(
                "INC-DENIED-REOPEN-{$index}",
                $sourceState->id,
                $citizen['user']->id
            );
            $this->assignIncidentToOperator($incident, $operator['user']->id, $admin['user']->id);

            foreach ([$operator['user'], $citizen['user']] as $forbiddenUser) {
                $this->actingAsUser($forbiddenUser)
                    ->patchJson("/api/incidents/{$incident->id}/state", [
                        'state_id' => $reopenedState->id,
                        'comment' => 'This role cannot reopen incidents.',
                    ])->assertForbidden()
                    ->assertJsonPath('message', 'Tu rol no puede ejecutar esta transicion.');
            }

            $this->assertSame($sourceState->id, $incident->fresh()->state_id);
        }
    }

    public function test_resolved_incident_cannot_transition_directly_to_reopened(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-resolved-reopen@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-resolved-reopen@incidencias.local');
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();
        $reopenedState = State::where('name', 'REABIERTA')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-RESOLVED-REOPEN',
            $resolvedState->id,
            $citizen['user']->id
        );

        $this->actingAsUser($admin['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $reopenedState->id,
                'comment' => 'This path is obsolete.',
            ])->assertUnprocessable()
            ->assertJsonPath('message', 'La transicion de estado no esta permitida.');

        $this->assertSame($resolvedState->id, $incident->fresh()->state_id);
    }

    public function test_resolution_request_notifies_supervisor_and_approval_notifies_requester_and_broadcasts(): void
    {
        Event::fake([IncidentStateChanged::class]);
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-resolution-request@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-resolution-request@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-resolution-request@incidencias.local');
        $inProgressState = State::where('name', 'EN_PROGRESO')->firstOrFail();
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();

        $incident = Incident::create([
            'code' => 'INC-REQ-APPROVE',
            'title' => 'Resolution request',
            'description' => 'The supervisor reviews completed operator work.',
            'category_id' => Category::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => $inProgressState->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $citizen['user']->id,
        ]);
        $this->assignIncidentToOperator($incident, $operator['user']->id, $supervisor['user']->id);

        $requestResponse = $this->actingAsUser($operator['user'])
            ->postJson("/api/incidents/{$incident->id}/state-requests", [
                'state_id' => $resolvedState->id,
                'reason' => 'Repairs completed and verified.',
            ])->assertCreated();

        $requestId = (int) $requestResponse->json('data.id');
        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $supervisor['user']->id,
            'incident_id' => $incident->id,
            'title' => 'Solicitud de cambio de estado',
            'type' => 'STATUS_CHANGE',
        ]);

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state-requests/{$requestId}/approve", [
                'comment' => 'Resolution verified.',
            ])->assertOk();

        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $operator['user']->id,
            'incident_id' => $incident->id,
            'title' => 'Cambio de estado aprobado',
            'type' => 'STATUS_CHANGE',
        ]);
        $this->assertSame($resolvedState->id, $incident->fresh()->state_id);
        $this->assertDatabaseHas('core.incident_assignments', [
            'incident_id' => $incident->id,
            'user_id' => $operator['user']->id,
            'active' => true,
        ]);
        Event::assertDispatched(
            IncidentStateChanged::class,
            fn (IncidentStateChanged $event): bool => $event->broadcastWith()['incident_id'] === $incident->id
                && $event->broadcastWith()['new_state_id'] === $resolvedState->id
        );
    }

    public function test_stale_resolution_request_cannot_reopen_a_closed_incident(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-stale-request@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-stale-request@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-stale-request@incidencias.local');
        $inProgressState = State::where('name', 'EN_PROGRESO')->firstOrFail();
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();
        $closedState = State::where('name', 'CERRADA')->firstOrFail();
        $incident = $this->createIncidentInState(
            'INC-STALE-REQUEST',
            $inProgressState->id,
            $citizen['user']->id
        );
        $this->assignIncidentToOperator($incident, $operator['user']->id, $supervisor['user']->id);

        $requestId = (int) $this->actingAsUser($operator['user'])
            ->postJson("/api/incidents/{$incident->id}/state-requests", [
                'state_id' => $resolvedState->id,
                'reason' => 'Work completed before the incident advanced.',
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $resolvedState->id,
                'comment' => 'Advanced outside the pending request.',
            ])->assertOk();
        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state", [
                'state_id' => $closedState->id,
            ])->assertOk();

        $historyCount = IncidentState::where('incident_id', $incident->id)->count();
        $notificationCount = Notification::where('incident_id', $incident->id)->count();
        $assignments = IncidentAssignment::where('incident_id', $incident->id)->get()->toArray();

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state-requests/{$requestId}/approve")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Solo se puede solicitar la resolucion de una incidencia en progreso.');

        $this->assertSame($closedState->id, $incident->fresh()->state_id);
        $this->assertSame('pending', StateChangeRequest::findOrFail($requestId)->status);
        $this->assertSame($historyCount, IncidentState::where('incident_id', $incident->id)->count());
        $this->assertSame($notificationCount, Notification::where('incident_id', $incident->id)->count());
        $this->assertSame(
            $assignments,
            IncidentAssignment::where('incident_id', $incident->id)->get()->toArray()
        );
        $this->assertSame(0, IncidentAssignment::where('incident_id', $incident->id)
            ->where('active', true)
            ->count());
    }

    public function test_rejection_notifies_the_support_operator_who_requested_it(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-resolution-reject@incidencias.local');
        $primary = $this->authenticateAs('OPERADOR', 'primary-resolution-reject@incidencias.local');
        $requester = $this->authenticateAs('OPERADOR', 'support-resolution-reject@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-resolution-reject@incidencias.local');
        $inProgressState = State::where('name', 'EN_PROGRESO')->firstOrFail();
        $resolvedState = State::where('name', 'RESUELTA')->firstOrFail();

        $incident = Incident::create([
            'code' => 'INC-REQ-REJECT',
            'title' => 'Rejected resolution request',
            'description' => 'The support operator receives the exact review outcome.',
            'category_id' => Category::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => $inProgressState->id,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $citizen['user']->id,
        ]);
        $this->assignIncidentToOperator($incident, $primary['user']->id, $supervisor['user']->id);
        IncidentAssignment::query()->create([
            'incident_id' => $incident->id,
            'user_id' => $requester['user']->id,
            'assigned_by_id' => $supervisor['user']->id,
            'assignment_role' => IncidentAssignment::ROLE_SUPPORT,
            'active' => true,
        ]);

        $requestId = (int) $this->actingAsUser($requester['user'])
            ->postJson("/api/incidents/{$incident->id}/state-requests", [
                'state_id' => $resolvedState->id,
                'reason' => 'Support work completed.',
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($supervisor['user'])
            ->patchJson("/api/incidents/{$incident->id}/state-requests/{$requestId}/reject", [
                'comment' => 'Additional inspection required.',
            ])->assertOk();

        $this->assertDatabaseHas('core.notifications', [
            'user_id' => $requester['user']->id,
            'incident_id' => $incident->id,
            'title' => 'Cambio de estado rechazado',
            'type' => 'STATUS_CHANGE',
        ]);
        $this->assertDatabaseMissing('core.notifications', [
            'user_id' => $primary['user']->id,
            'incident_id' => $incident->id,
            'title' => 'Cambio de estado rechazado',
        ]);
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

    public function test_partial_priority_update_preserves_incident_location_classification_and_reference(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-partial-update@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-partial-update@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $territorialUnitId = $this->territorialUnitId();
        $priority = Priority::where('name', 'Alta')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Canal obstruido',
                'description' => 'El canal esta acumulando agua junto a viviendas.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $territorialUnitId,
                'address_reference' => 'Frente a la cancha del barrio',
                'latitude' => -2.1709,
                'longitude' => -79.9224,
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($admin['user'])
            ->putJson("/api/incidents/{$incidentId}", [
                'priority_id' => $priority->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.priority.id', $priority->id);

        $incident = Incident::findOrFail($incidentId);

        $this->assertSame($subcategory->id, (int) $incident->subcategory_id);
        $this->assertSame($territorialUnitId, (int) $incident->territorial_unit_id);
        $this->assertSame('Frente a la cancha del barrio', $incident->address_reference);
        $this->assertSame('-2.17090000', (string) $incident->latitude);
        $this->assertSame('-79.92240000', (string) $incident->longitude);
    }

    public function test_update_hides_internal_comments_from_editor_without_internal_comment_permission(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-update-redaction@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-update-redaction@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-update-redaction@incidencias.local');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $priority = Priority::where('name', 'Alta')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia con comentario interno',
                'description' => 'El detalle interno no debe filtrarse por una ruta diferente.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $this->territorialUnitId(),
            ])->assertCreated()
            ->json('data.id');

        $this->actingAsUser($admin['user'])
            ->postJson("/api/incidents/{$incidentId}/assignments", [
                'user_id' => $operator['user']->id,
            ])->assertCreated();

        $this->actingAsUser($operator['user'])
            ->postJson("/api/incidents/{$incidentId}/comments", [
                'comment' => 'Diagnóstico interno confidencial.',
                'is_internal' => true,
            ])->assertCreated();

        Role::where('code', 'ADMIN')->firstOrFail()->permissions()->detach(
            Permission::where('code', 'comments.internal')->value('id')
        );
        $this->assertTrue($admin['user']->fresh()->tienePermiso('incidents.edit'));
        $this->assertFalse($admin['user']->fresh()->tienePermiso('comments.internal'));

        $response = $this->actingAsUser($admin['user'])
            ->putJson("/api/incidents/{$incidentId}", [
                'priority_id' => $priority->id,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.priority.id', $priority->id)
            ->assertJsonPath('data.comments', []);
    }

    public function test_update_rolls_back_when_reloading_detail_fails(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-update-rollback@incidencias.local');
        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $priority = Priority::where('name', 'Alta')->firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Incidencia para rollback',
                'description' => 'La prioridad no debe persistir si falla la recarga del detalle.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'territorial_unit_id' => $this->territorialUnitId(),
            ])->assertCreated()
            ->json('data.id');

        $editableIncident = new IncidentEntity(
            id: (int) $incidentId,
            code: 'INC-ROLLBACK',
            title: 'Incidencia para rollback',
            description: 'La prioridad no debe persistir si falla la recarga del detalle.',
            reporterUserId: (int) $citizen['user']->id,
            assigneeUserId: null,
            stateId: 1,
            state: new IncidentStateEntity(1, 'NUEVA', true, false)
        );

        $repository = Mockery::mock(IncidentRepositoryInterface::class);
        $repository->shouldReceive('load')->once()->andReturn($editableIncident);
        $repository->shouldReceive('update')
            ->once()
            ->andReturnUsing(function () use ($incidentId, $priority, $editableIncident): IncidentEntity {
                Incident::whereKey($incidentId)->update(['priority_id' => $priority->id]);

                return $editableIncident;
            });
        $repository->shouldReceive('loadDetail')
            ->once()
            ->andThrow(new RuntimeException('Forced detail reload failure.'));

        $this->app->instance(IncidentRepositoryInterface::class, $repository);
        $this->app->instance(FileStoragePort::class, Mockery::mock(FileStoragePort::class));

        $exceptionWasThrown = false;
        try {
            app(IncidentUseCase::class)->update(
                (int) $incidentId,
                new UpdateIncidentInputData(
                    priorityId: (int) $priority->id,
                    presentFields: ['priorityId']
                )
            );
        } catch (RuntimeException $exception) {
            $exceptionWasThrown = true;
            $this->assertSame('Forced detail reload failure.', $exception->getMessage());
        }

        $this->assertTrue($exceptionWasThrown);
        $this->assertNull(Incident::findOrFail($incidentId)->priority_id);
    }

    public function test_operator_alert_command_notifies_unreviewed_and_near_due_incidents(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-command-alerts@incidencias.local');
        $admin = $this->authenticateAs('ADMIN', 'admin-command-alerts@incidencias.local');
        $operator = $this->authenticateAs('OPERADOR', 'operator-command-alerts@incidencias.local');
        $supervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-command-alerts@incidencias.local');

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
            $this->userHasNotification($supervisor['user'], 'Incidencia sin atender', $unreviewedCode)
        );
        $this->assertFalse(
            $this->userHasNotification($operator['user'], 'Incidencia sin atender', $unreviewedCode)
        );
        $this->assertTrue(
            $this->userHasNotification($operator['user'], 'Incidencia proxima a vencer', $nearDueCode)
        );
        $this->assertTrue(
            Notification::where('user_id', $operator['user']->id)
                ->where('incident_id', $nearDueIncidentId)
                ->where('title', 'Incidencia proxima a vencer')
                ->exists()
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

    public function test_supervisor_alert_command_does_not_cross_operational_zones(): void
    {
        $this->seedCoreData();

        $citizen = $this->authenticateAs('CIUDADANO', 'citizen-zone-alert@incidencias.local');
        $guayasSupervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-guayas-alert@incidencias.local');
        $sierraSupervisor = $this->authenticateAs('SUPERVISOR', 'supervisor-sierra-alert@incidencias.local');
        $this->assignUserToZone($guayasSupervisor['user']->id, 'Guayas');
        $this->assignUserToZone($sierraSupervisor['user']->id, 'Sierra Norte / Centro');

        $category = Category::firstOrFail();
        $subcategory = Subcategory::where('category_id', $category->id)->firstOrFail();
        $priority = Priority::where('name', 'Baja')->firstOrFail();
        $state = State::where('name', 'NUEVA')->firstOrFail();

        $incident = Incident::create([
            'code' => 'INC-ZONE-OVERDUE',
            'title' => 'SLA vencido en Pichincha',
            'description' => 'Alerta que solo corresponde al supervisor de Sierra.',
            'category_id' => $category->id,
            'subcategory_id' => $subcategory->id,
            'priority_id' => $priority->id,
            'state_id' => $state->id,
            'territorial_unit_id' => $this->parishIdForProvince('Pichincha'),
            'reported_by_id' => $citizen['user']->id,
        ]);
        $incident->forceFill(['due_date' => now()->subHour()])->save();

        $this->artisan('incidents:notify-supervisors')->assertExitCode(0);

        $this->assertTrue(
            Notification::where('user_id', $sierraSupervisor['user']->id)
                ->where('incident_id', $incident->id)
                ->where('title', 'Incidencia vencida por SLA')
                ->exists()
        );
        $this->assertFalse(
            Notification::where('user_id', $guayasSupervisor['user']->id)
                ->where('incident_id', $incident->id)
                ->where('title', 'Incidencia vencida por SLA')
                ->exists()
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

    private function createIncidentInState(string $code, int $stateId, int $reporterUserId): Incident
    {
        return Incident::create([
            'code' => $code,
            'title' => 'Incident for reopening workflow',
            'description' => 'Validates the closed incident reopening rules.',
            'category_id' => Category::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => $stateId,
            'territorial_unit_id' => $this->territorialUnitId(),
            'reported_by_id' => $reporterUserId,
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
