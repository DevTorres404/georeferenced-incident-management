<?php

namespace Tests\Feature;

use Database\Seeders\CatalogSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\PermissionSeeder;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
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
            \Database\Seeders\CategorySeeder::class,
            \Database\Seeders\PrioritySeeder::class,
            \Database\Seeders\StateSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\PermissionSeeder::class
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

        $categoryId = \App\Incidents\Infrastructure\Persistence\Models\Category::first()->id;

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

        $stateId = \App\Incidents\Infrastructure\Persistence\Models\State::first()->id;

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
}
