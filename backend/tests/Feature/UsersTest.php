<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
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
