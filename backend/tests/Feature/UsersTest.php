<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UsersTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_users(): void
    {
        $admin = $this->authenticateAdmin();
        User::factory()->count(2)->create();

        $response = $this->withToken($admin['token'])
            ->getJson('/api/users');

        $response->assertOk()
            ->assertJsonStructure([
                'data',
                'meta' => ['current_page', 'per_page', 'total', 'last_page'],
            ]);
    }

    public function test_admin_can_create_user(): void
    {
        $admin = $this->authenticateAdmin();

        $response = $this->withToken($admin['token'])
            ->postJson('/api/users', [
                'first_name' => 'Lucia',
                'last_name' => 'Morales',
                'username' => 'lucia.morales',
                'email' => 'lucia@incidencias.local',
                'password' => 'password-seguro',
                'roles' => ['CIUDADANO'],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.email', 'lucia@incidencias.local')
            ->assertJsonPath('data.username', 'lucia.morales');

        $this->assertTrue(
            Notification::where('user_id', $admin['user']->id)
                ->where('title', 'Usuario creado')
                ->exists()
        );
    }

    public function test_admin_can_update_user(): void
    {
        $admin = $this->authenticateAdmin();
        $user = User::factory()->create(['first_name' => 'Antiguo', 'is_active' => true]);

        $response = $this->withToken($admin['token'])
            ->patchJson("/api/users/{$user->id}", [
                'first_name' => 'Nuevo',
                'is_active' => false,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.nombre', 'Nuevo')
            ->assertJsonPath('data.activo', false);

        $this->assertDatabaseHas('auth.users', [
            'id' => $user->id,
            'first_name' => 'Nuevo',
            'is_active' => false,
        ]);
    }

    public function test_admin_can_delete_user(): void
    {
        $admin = $this->authenticateAdmin();
        $user = User::factory()->create(['is_active' => true]);

        $response = $this->withToken($admin['token'])
            ->deleteJson("/api/users/{$user->id}");

        $response->assertOk();
        $this->assertSoftDeleted('auth.users', ['id' => $user->id]);
    }

    public function test_admin_can_sync_user_roles(): void
    {
        $admin = $this->authenticateAdmin();
        $user = User::factory()->create();
        $role = Role::where('code', 'SUPERVISOR')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/users/{$user->id}/roles", [
                'roles' => ['SUPERVISOR'],
            ]);

        $response->assertOk();
        $this->assertTrue($user->fresh()->roles()->where('roles.id', $role->id)->exists());
    }

    private function authenticateAdmin(): array
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);

        $user = User::factory()->create([
            'email' => 'admin-users@incidencias.local',
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
