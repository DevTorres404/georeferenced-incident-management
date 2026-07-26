<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed catalogs, roles and permissions
        $this->seed([
            CategorySeeder::class,
            PrioritySeeder::class,
            StateSeeder::class,
            RoleSeeder::class,
            PermissionSeeder::class,
        ]);
    }

    public function test_user_can_fetch_all_catalogs_overview(): void
    {
        $response = $this->getJson('/api/catalogs');

        $response->assertOk()
            ->assertJsonStructure([
                'categories',
                'priorities',
                'states',
            ]);
    }

    public function test_user_can_fetch_categories_and_subcategories(): void
    {
        $responseCategories = $this->getJson('/api/catalogs/categories');

        $responseCategories->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'color']]]);

        $categoryId = Category::first()->id;

        $responseSubcategories = $this->getJson("/api/catalogs/categories/{$categoryId}/subcategories");

        $responseSubcategories->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name']]]);
    }

    public function test_user_can_fetch_priorities(): void
    {
        $response = $this->getJson('/api/catalogs/priorities');

        $response->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'level', 'color']]]);
    }

    public function test_user_can_fetch_states_and_transitions(): void
    {
        $responseStates = $this->getJson('/api/catalogs/states');

        $responseStates->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'color']]]);

        $stateId = State::first()->id;

        $responseTransitions = $this->getJson("/api/catalogs/states/{$stateId}/transitions");

        $responseTransitions->assertOk();
    }

    public function test_user_must_be_authenticated_to_fetch_roles(): void
    {
        $response = $this->getJson('/api/catalogs/roles');
        $response->assertUnauthorized();
    }

    public function test_admin_can_fetch_roles_and_permissions(): void
    {
        $admin = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $admin->roles()->sync([$role->id]);

        $responseRoles = $this->actingAs($admin)->getJson('/api/catalogs/roles');

        $responseRoles->assertOk()
            ->assertJsonStructure(['data' => [['id', 'code', 'name']]]);

        $responsePermissions = $this->actingAs($admin)->getJson('/api/catalogs/permissions');

        $responsePermissions->assertOk()
            ->assertJsonStructure(['data' => [['id', 'code', 'name']]]);
    }

    public function test_admin_can_create_category(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');

        $response = $this->actingAs($admin)->postJson('/api/admin/catalogs/categories', [
            'name' => '  Nueva   Categoria  ',
            'description' => 'Test',
            'color' => '#123456',
            'is_active' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Nueva Categoria');
        $this->assertDatabaseHas('core.categories', ['name' => 'Nueva Categoria']);
    }

    public function test_admin_can_list_catalog_records_with_typed_query_filters(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/catalogs/categories?per_page=100&is_active=1');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'name']],
                'meta' => ['current_page', 'per_page', 'total'],
            ])
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_admin_can_update_category(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $category = Category::first();

        $response = $this->actingAs($admin)->putJson("/api/admin/catalogs/categories/{$category->id}", [
            'name' => 'Categoria Actualizada',
            'description' => 'Test Update',
            'color' => '#654321',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Categoria Actualizada');
        $this->assertDatabaseHas('core.categories', ['id' => $category->id, 'name' => 'Categoria Actualizada']);
    }

    public function test_admin_can_create_priority(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');

        $response = $this->actingAs($admin)->postJson('/api/admin/catalogs/priorities', [
            'name' => 'Nueva Prioridad',
            'level' => 10,
            'color' => '#000000',
            'sla_hours' => 24,
            'weight' => 10,
            'is_active' => true,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('core.priorities', ['name' => 'Nueva Prioridad', 'level' => 10]);
    }

    public function test_admin_can_toggle_category_active_state(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $category = Category::first();
        $originalActive = $category->is_active;

        $response = $this->actingAs($admin)->putJson("/api/admin/catalogs/categories/{$category->id}", [
            'name' => $category->name,
            'is_active' => ! $originalActive,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.is_active', ! $originalActive);
        $this->assertDatabaseHas('core.categories', ['id' => $category->id, 'is_active' => ! $originalActive]);
    }

    public function test_create_category_fails_with_duplicate_name(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $existing = Category::first();

        $response = $this->actingAs($admin)->postJson('/api/admin/catalogs/categories', [
            'name' => $existing->name,
            'color' => '#aabbcc',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_user_without_permission_cannot_create_category(): void
    {
        $user = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'CIUDADANO')->firstOrFail();
        $user->roles()->sync([$role->id]);

        $response = $this->actingAs($user)->postJson('/api/admin/catalogs/categories', [
            'name' => 'Sin Permiso',
            'color' => '#111111',
        ]);

        $response->assertForbidden();
    }

    public function test_admin_can_create_subcategory(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $category = Category::first();

        $response = $this->actingAs($admin)->postJson('/api/admin/catalogs/subcategories', [
            'category_id' => $category->id,
            'name' => 'Nuevo Subtipo',
            'description' => 'Descripción del subtipo',
            'is_active' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Nuevo Subtipo');
        $this->assertDatabaseHas('core.subcategories', [
            'category_id' => $category->id,
            'name' => 'Nuevo Subtipo',
        ]);
    }

    public function test_admin_can_update_subcategory(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $category = Category::first();

        // Crear subtipo para luego actualizarlo
        $createResponse = $this->actingAs($admin)->postJson('/api/admin/catalogs/subcategories', [
            'category_id' => $category->id,
            'name' => 'Subtipo Original',
            'is_active' => true,
        ]);
        $createResponse->assertCreated();
        $subId = $createResponse->json('data.id');

        $response = $this->actingAs($admin)->putJson("/api/admin/catalogs/subcategories/{$subId}", [
            'category_id' => $category->id,
            'name' => 'Subtipo Actualizado',
            'is_active' => false,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Subtipo Actualizado');
        $this->assertDatabaseHas('core.subcategories', ['id' => $subId, 'name' => 'Subtipo Actualizado', 'is_active' => false]);
    }

    public function test_create_subcategory_requires_valid_category_id(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');

        $response = $this->actingAs($admin)->postJson('/api/admin/catalogs/subcategories', [
            'category_id' => 99999,
            'name' => 'Subtipo Huérfano',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['category_id']);
    }

    public function test_create_subcategory_rejects_duplicate_name_within_same_category(): void
    {
        $admin = $this->authenticateAdminWithPermission('catalogs.manage');
        $existing = Subcategory::firstOrFail();

        $this->actingAs($admin)->postJson('/api/admin/catalogs/subcategories', [
            'category_id' => $existing->category_id,
            'name' => $existing->name,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_supervisor_with_catalog_permission_cannot_mutate_catalogs(): void
    {
        $supervisor = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'SUPERVISOR')->firstOrFail();
        $permission = Permission::where('code', 'catalogs.manage')->firstOrFail();
        $role->permissions()->syncWithoutDetaching([$permission->id]);
        $supervisor->roles()->sync([$role->id]);

        $this->actingAs($supervisor)->postJson('/api/admin/catalogs/categories', [
            'name' => 'Categoría no autorizada',
            'color' => '#112233',
        ])->assertForbidden();
    }

    private function authenticateAdminWithPermission(string $permissionCode): User
    {
        $admin = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'ADMIN')->firstOrFail();

        $permission = Permission::where('code', $permissionCode)->firstOrFail();
        $role->permissions()->syncWithoutDetaching([$permission->id]);

        $admin->roles()->sync([$role->id]);

        return $admin;
    }
}
