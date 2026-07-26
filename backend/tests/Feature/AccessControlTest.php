<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\NavigationItem;
use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use Database\Seeders\NavigationItemSeeder;
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

    public function test_admin_can_get_access_control_overview(): void
    {
        $admin = $this->authenticateAdmin();

        $response = $this->withToken($admin['token'])
            ->getJson('/api/admin/access-control');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'roles' => [['id', 'code', 'name', 'permissions']],
                    'permissions' => [['id', 'code', 'name']],
                ],
            ]);

        $this->assertNotEmpty($response->json('data.permissions_by_module'));
    }

    public function test_admin_can_sync_role_permissions(): void
    {
        $admin = $this->authenticateAdmin();
        $role = Role::where('code', 'OPERADOR')->firstOrFail();
        $permission = Permission::where('code', 'incidents.edit')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/admin/roles/{$role->id}/permissions", [
                'permissions' => [$permission->code],
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Permisos del rol actualizados correctamente.');

        $this->assertTrue($role->permissions()->where('permissions.id', $permission->id)->exists());
        $this->assertTrue($this->adminHasNotification($admin['user'], 'Cambio de permisos'));
    }

    public function test_admin_can_sync_role_permissions_and_visible_screens_atomically(): void
    {
        $admin = $this->authenticateAdmin();
        $this->seed(NavigationItemSeeder::class);
        $operatorRole = Role::where('code', 'OPERADOR')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/admin/roles/{$operatorRole->id}/access", [
                'permissions' => ['incidents.assign'],
                'navigation_items' => ['assignment-management'],
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Accesos del rol actualizados correctamente.')
            ->assertJsonPath('data.role.code', 'OPERADOR');

        $operatorRole->refresh();
        $this->assertTrue($operatorRole->permissions()->where('code', 'incidents.assign')->exists());
        $this->assertContains(
            'OPERADOR',
            NavigationItem::where('code', 'assignment-management')->firstOrFail()->allowed_roles
        );
        $this->assertNotContains(
            'OPERADOR',
            NavigationItem::where('code', 'dashboard')->firstOrFail()->allowed_roles
        );
        $this->assertTrue($this->adminHasNotification($admin['user'], 'Cambio de accesos'));
    }

    public function test_admin_control_plane_cannot_be_removed_from_admin_role(): void
    {
        $admin = $this->authenticateAdmin();
        $this->seed(NavigationItemSeeder::class);
        $adminRole = Role::where('code', 'ADMIN')->firstOrFail();

        $this->withToken($admin['token'])
            ->putJson("/api/admin/roles/{$adminRole->id}/access", [
                'permissions' => ['dashboard.view'],
                'navigation_items' => ['dashboard'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['permissions', 'navigation_items']);

        $this->assertTrue($adminRole->permissions()->where('code', 'users.manage_roles')->exists());
        $this->assertNull(
            NavigationItem::where('code', 'role-permissions')->firstOrFail()->allowed_roles
        );
    }

    public function test_saved_role_access_survives_catalog_reseeding(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);
        $operatorRole = Role::where('code', 'OPERADOR')->firstOrFail();
        $operatorRole->permissions()->sync([]);
        NavigationItem::where('code', 'incident-map')->firstOrFail()->update([
            'allowed_roles' => ['ADMIN'],
        ]);

        $this->seed([PermissionSeeder::class, NavigationItemSeeder::class]);

        $this->assertSame(0, $operatorRole->permissions()->count());
        $this->assertSame(
            ['ADMIN'],
            NavigationItem::where('code', 'incident-map')->firstOrFail()->allowed_roles
        );
    }

    public function test_admin_can_sync_user_roles(): void
    {
        $admin = $this->authenticateAdmin();
        $user = User::factory()->create();
        $role = Role::where('code', 'OPERADOR')->firstOrFail();

        $response = $this->withToken($admin['token'])
            ->putJson("/api/users/{$user->id}/roles", [
                'roles' => [$role->code],
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Roles actualizados correctamente.');

        $this->assertTrue($user->roles()->where('roles.id', $role->id)->exists());
        $this->assertTrue($this->adminHasNotification($admin['user'], 'Cambio de rol'));
        $this->assertTrue(
            Notification::where('user_id', $user->id)
                ->where('title', 'Tu rol fue actualizado')
                ->exists()
        );
    }

    public function test_navigation_includes_authorized_child_when_parent_uses_another_permission(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);

        $workspaceNode = NavigationItem::where('code', 'workspace')->firstOrFail();
        NavigationItem::create([
            'code' => 'notifications',
            'label' => 'Notificaciones',
            'permission_code' => 'notifications.view',
            'parent_id' => $workspaceNode->id,
            'active' => true,
        ]);

        $citizen = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $citizenRole = Role::where('code', 'CIUDADANO')->firstOrFail();
        $citizen->roles()->sync([$citizenRole->id]);

        $response = $this->withToken($citizen->createToken('navigation-test')->plainTextToken)
            ->getJson('/api/navigation/menu')
            ->assertOk();

        $workspace = collect($response->json('data'))->firstWhere('code', 'workspace');

        $this->assertNotNull($workspace);
        $this->assertContains('notifications', collect($workspace['children'])->pluck('code')->all());
        $this->assertNotContains('dashboard', collect($workspace['children'])->pluck('code')->all());
    }

    public function test_navigation_ignores_permissions_from_inactive_roles(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);

        $user = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $role = Role::where('code', 'CIUDADANO')->firstOrFail();
        $user->roles()->sync([$role->id]);
        $role->update(['is_active' => false]);

        $this->withToken($user->createToken('inactive-role-test')->plainTextToken)
            ->getJson('/api/navigation/menu')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_admin_navigation_contains_only_the_requested_operational_areas(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);

        $admin = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $admin->roles()->sync([Role::where('code', 'ADMIN')->firstOrFail()->id]);

        $response = $this->withToken($admin->createToken('admin-navigation-test')->plainTextToken)
            ->getJson('/api/navigation/menu')
            ->assertOk();

        $groups = collect($response->json('data'));

        $this->assertSame(
            ['workspace', 'incident-hub', 'territorial-ops', 'admin-tools', 'system-info'],
            $groups->pluck('code')->all()
        );
        $this->assertSame(
            ['dashboard', 'reports'],
            collect($groups->firstWhere('code', 'workspace')['children'])->pluck('code')->all()
        );
        $this->assertSame(
            ['incidents', 'incident-map'],
            collect($groups->firstWhere('code', 'incident-hub')['children'])->pluck('code')->all()
        );
        $this->assertSame(
            ['operational-structure'],
            collect($groups->firstWhere('code', 'territorial-ops')['children'])->pluck('code')->all()
        );
        $this->assertSame(
            ['role-permissions', 'user-roles', 'category-management', 'audit-logs'],
            collect($groups->firstWhere('code', 'admin-tools')['children'])->pluck('code')->all()
        );
        $this->assertSame(
            ['about'],
            collect($groups->firstWhere('code', 'system-info')['children'])->pluck('code')->all()
        );
        $this->assertNull($groups->firstWhere('code', 'territorial-zonal'));
    }

    public function test_supervisor_keeps_assignment_management_and_zonal_coverage(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);

        $supervisor = User::factory()->create(['two_factor_confirmed_at' => now()]);
        $supervisor->roles()->sync([Role::where('code', 'SUPERVISOR')->firstOrFail()->id]);

        $response = $this->withToken($supervisor->createToken('supervisor-navigation-test')->plainTextToken)
            ->getJson('/api/navigation/menu')
            ->assertOk();

        $groups = collect($response->json('data'));

        $this->assertSame(
            ['assignment-management', 'incident-map'],
            collect($groups->firstWhere('code', 'incident-hub')['children'])->pluck('code')->all()
        );
        $this->assertSame(
            ['my-team'],
            collect($groups->firstWhere('code', 'territorial-zonal')['children'])->pluck('code')->all()
        );
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
                'permissions' => [$permission->id],
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
