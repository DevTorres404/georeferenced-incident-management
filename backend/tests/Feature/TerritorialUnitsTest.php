<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TerritorialUnitsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
        ]);

        $this->admin = User::factory()->create([
            'email' => 'admin@incidencias.local',
            'two_factor_confirmed_at' => now(),
        ]);

        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $role->permissions()->syncWithoutDetaching(Permission::pluck('id')->all());
        $this->admin->roles()->sync([$role->id]);
    }

    private function actingAsAdmin(): self
    {
        Sanctum::actingAs($this->admin->fresh(), ['*']);

        return $this;
    }

    public function test_can_list_territorial_units()
    {
        TerritorialUnit::create(['name' => 'Unit 1', 'type' => 'province', 'code' => 'P1', 'is_active' => true]);
        TerritorialUnit::create(['name' => 'Unit 2', 'type' => 'canton', 'code' => 'C1', 'is_active' => true]);

        $response = $this->actingAsAdmin()->getJson('/api/territorial-units');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => [['id', 'name', 'type']]]);

        $this->assertCount(2, $response->json('data'));
    }

    public function test_can_filter_territorial_units_by_type()
    {
        TerritorialUnit::create(['name' => 'Unit 1', 'type' => 'province', 'code' => 'P1', 'is_active' => true]);
        TerritorialUnit::create(['name' => 'Unit 2', 'type' => 'canton', 'code' => 'C1', 'is_active' => true]);

        $response = $this->actingAsAdmin()->getJson('/api/territorial-units?type=province');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('Unit 1', $response->json('data.0.name'));
    }

    public function test_can_get_territorial_tree()
    {
        $province = TerritorialUnit::create(['name' => 'Prov 1', 'type' => 'province', 'code' => 'P1', 'is_active' => true]);
        TerritorialUnit::create(['name' => 'Canton 1', 'type' => 'canton', 'code' => 'C1', 'parent_id' => $province->id, 'is_active' => true]);

        $response = $this->actingAsAdmin()->getJson('/api/territorial-units/tree');

        $response->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_can_get_provinces_and_cantons()
    {
        $country = TerritorialUnit::create(['name' => 'C', 'type' => 'country']);
        $zone = TerritorialUnit::create(['name' => 'Z', 'type' => 'operational_zone', 'parent_id' => $country->id]);
        $province = TerritorialUnit::create(['name' => 'Provincia', 'type' => 'province', 'code' => 'P1', 'parent_id' => $zone->id, 'is_active' => true]);
        TerritorialUnit::create(['name' => 'Canton 1', 'type' => 'canton', 'code' => 'P1-C1', 'parent_id' => $province->id, 'is_active' => true]);

        $responseProvinces = $this->actingAsAdmin()->getJson('/api/territorial-units/provinces');
        $responseProvinces->assertStatus(200);
        $this->assertCount(1, $responseProvinces->json('data'));

        $responseCantons = $this->actingAsAdmin()->getJson("/api/territorial-units/provinces/{$province->id}/cantons");
        $responseCantons->assertStatus(200);
        $this->assertCount(1, $responseCantons->json('data'));
    }

    public function test_can_create_territorial_unit()
    {
        $response = $this->actingAsAdmin()->postJson('/api/territorial-units', [
            'name' => 'Nuevo Pais',
            'type' => 'country',
            'code' => 'COUNTRY-NEW',
            'is_active' => true,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('core.territorial_units', ['name' => 'Nuevo Pais']);
    }

    public function test_can_update_territorial_unit()
    {
        $unit = TerritorialUnit::create(['name' => 'Old Name', 'type' => 'country', 'code' => 'P1', 'is_active' => true]);

        $response = $this->actingAsAdmin()->putJson("/api/territorial-units/{$unit->id}", [
            'name' => 'New Name',
            'type' => 'country',
            'code' => 'P1-NEW',
            'is_active' => false,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('core.territorial_units', ['id' => $unit->id, 'name' => 'New Name', 'is_active' => false]);
    }

    public function test_can_delete_territorial_unit()
    {
        $unit = TerritorialUnit::create(['name' => 'To Delete', 'type' => 'country', 'code' => 'P1', 'is_active' => true]);

        $response = $this->actingAsAdmin()->deleteJson("/api/territorial-units/{$unit->id}");

        $response->assertStatus(200);
        $this->assertDatabaseHas('core.territorial_units', ['id' => $unit->id, 'is_active' => false]);
    }
}
