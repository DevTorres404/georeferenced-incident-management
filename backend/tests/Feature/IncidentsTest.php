<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\City;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use Database\Seeders\CategorySeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $priority = Priority::firstOrFail();
        $city = City::firstOrFail();

        $createResponse = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Bache grande frente al parque',
                'description' => 'La vía tiene un hueco peligroso.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'city_id' => $city->id,
                'address' => 'Av. Central y Calle 10',
                'latitude' => -2.1709,
                'longitude' => -79.9224,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.title', 'Bache grande frente al parque');

        $incidentId = $createResponse->json('data.id');

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
                    'city',
                    'history',
                    'comments',
                    'attachments',
                    'assignments',
                ],
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
        $priority = Priority::firstOrFail();
        $city = City::firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Semáforo apagado',
                'description' => 'El semáforo dejó de funcionar.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'city_id' => $city->id,
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
            ->assertJsonPath('data.user_id', $operator['user']->id);

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
        $priority = Priority::firstOrFail();
        $city = City::firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Fuga de agua',
                'description' => 'Tuberia rota.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'city_id' => $city->id,
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
        $priority = Priority::firstOrFail();
        $city = City::firstOrFail();

        $incidentId = $this->actingAsUser($citizen['user'])
            ->postJson('/api/incidents', [
                'title' => 'Corte electrico',
                'description' => 'No hay luz.',
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $priority->id,
                'city_id' => $city->id,
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
            CountrySeeder::class,
        ]);
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

        return [
            'user' => $user,
        ];
    }

    private function actingAsUser(User $user): self
    {
        Sanctum::actingAs($user->fresh(), ['*']);

        return $this;
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
}
