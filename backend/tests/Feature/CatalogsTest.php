<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CatalogsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_territorial_endpoint_returns_provinces(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, TerritorialUnitSeeder::class]);
        $user = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'CIUDADANO')->firstOrFail();
        $user->roles()->sync([$role->id]);

        Sanctum::actingAs($user, ['*']);

        $response = $this->getJson('/api/territorial-units/provinces');

        $response->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_admin_can_create_catalog_category(): void
    {
        $admin = $this->authenticateAdmin();
        $this->seed([CategorySeeder::class]);

        $response = $this->withToken($admin['token'])
            ->postJson('/api/admin/catalogs/categories', [
                'name' => 'Movilidad',
                'description' => 'Problemas de movilidad urbana',
                'icon' => 'fa-bus',
                'color' => '#112233',
                'is_active' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Movilidad');
    }

    private function authenticateAdmin(): array
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);

        $user = User::factory()->create([
            'email' => 'admin-catalogs@incidencias.local',
            'two_factor_confirmed_at' => now(),
        ]);

        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $user->roles()->sync([$role->id]);

        return [
            'user' => $user,
            'token' => $user->createToken('test-token')->plainTextToken,
        ];
    }
}
