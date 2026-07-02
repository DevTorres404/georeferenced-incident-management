<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_roles_and_permissions(): void
    {
        $admin = $this->authenticateAdmin();

        $responseRoles = $this->withToken($admin['token'])
            ->getJson('/api/catalogs/roles');
            
        $responseRoles->assertOk()
            ->assertJsonStructure(['data' => [['id', 'code', 'name']]]);

        $responsePermissions = $this->withToken($admin['token'])
            ->getJson('/api/catalogs/permissions');
            
        $responsePermissions->assertOk()
            ->assertJsonStructure(['data' => [['id', 'code', 'name']]]);
    }

    public function test_admin_can_sync_role_permissions(): void
    {
        $admin = $this->authenticateAdmin();
        $role = Role::where('code', 'OPERADOR')->firstOrFail();
        $permission = Permission::where('code', 'incidents.edit')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/admin/roles/{$role->id}/permissions", [
                'permissions' => [$permission->code]
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Permisos del rol actualizados correctamente.');

        $this->assertTrue($role->permissions()->where('permissions.id', $permission->id)->exists());
        $this->assertTrue($this->adminHasNotification($admin['user'], 'Cambio de permisos'));
    }

    public function test_admin_can_sync_user_roles(): void
    {
        $admin = $this->authenticateAdmin();
        $user = User::factory()->create();
        $role = Role::where('code', 'OPERADOR')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/users/{$user->id}/roles", [
                'roles' => [$role->code]
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Roles actualizados correctamente.');

        $this->assertTrue($user->roles()->where('roles.id', $role->id)->exists());
        $this->assertTrue($this->adminHasNotification($admin['user'], 'Cambio de rol'));
    }

    public function test_non_admin_cannot_manage_roles(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);
        
        $citizen = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $citizenRole = Role::where('code', 'CIUDADANO')->firstOrFail();
        $citizen->roles()->sync([$citizenRole->id]);
        
        $token = $citizen->createToken('test-token')->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/catalogs/permissions');

        $response->assertForbidden();

        $role = Role::where('code', 'OPERADOR')->firstOrFail();
        $permission = Permission::firstOrFail();

        $response2 = $this->withToken($token)
            ->putJson("/api/admin/roles/{$role->id}/permissions", [
                'permissions' => [$permission->id]
            ]);

        $response2->assertForbidden();
    }

    private function authenticateAdmin(): array
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);

        $user = User::factory()->create([
            'email' => 'admin-acl@incidencias.local',
            'two_factor_confirmed_at' => now(),
        ]);

        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $user->roles()->sync([$role->id]);

        return [
            'user' => $user,
            'token' => $user->createToken('test-token')->plainTextToken,
        ];
    }

    private function adminHasNotification(User $admin, string $title): bool
    {
        return Notification::where('user_id', $admin->id)
            ->where('title', $title)
            ->exists();
    }
}
