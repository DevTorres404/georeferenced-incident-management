<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use Database\Seeders\NavigationItemSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MyTeamAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_defines_team_permission_and_exact_default_role_matrix(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);

        $permission = Permission::where('code', 'operations.view_team')->firstOrFail();

        $this->assertSame('Ver equipo de trabajo', $permission->name);
        $this->assertSame('Permite consultar los operadores asignados directamente al supervisor autenticado.', $permission->description);
        $this->assertSame('operations', $permission->module);
        $matrix = [
            'ADMIN' => [
                'incidents.create' => false,
                'operations.view' => true,
                'operations.manage' => true,
                'operations.view_team' => false,
            ],
            'SUPERVISOR' => [
                'incidents.create' => false,
                'operations.view' => false,
                'operations.view_team' => true,
                'users.view' => true,
            ],
            'OPERADOR' => [
                'incidents.create' => false,
                'operations.view_team' => false,
            ],
            'CIUDADANO' => [
                'incidents.create' => true,
                'operations.view_team' => false,
            ],
        ];

        foreach ($matrix as $roleCode => $permissions) {
            foreach ($permissions as $permissionCode => $expected) {
                $this->assertRolePermission($roleCode, $permissionCode, $expected);
            }
        }

        $this->assertSame(
            Permission::count() - 3,
            Role::where('code', 'ADMIN')->firstOrFail()->permissions()->count()
        );

        $this->assertDatabaseHas('auth.navigation_items', [
            'code' => 'operational-structure',
            'permission_code' => 'operations.view',
        ]);
        $this->assertDatabaseHas('auth.navigation_items', [
            'permission_code' => 'operations.view_team',
        ]);
    }

    public function test_data_migration_is_idempotent_and_preserves_existing_access_data(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, NavigationItemSeeder::class]);
        Permission::where('code', 'operations.view_team')->delete();

        $supervisor = Role::where('code', 'SUPERVISOR')->firstOrFail();
        $legacyPermissionIds = Permission::whereIn('code', ['incidents.create', 'operations.view'])
            ->pluck('id');
        $supervisor->permissions()->syncWithoutDetaching($legacyPermissionIds);

        $permissions = DB::table('auth.permissions')
            ->orderBy('code')
            ->get()
            ->map(fn (object $permission): array => (array) $permission)
            ->all();
        $unrelatedGrants = $this->unrelatedGrants($supervisor->id);
        $navigationItems = DB::table('auth.navigation_items')
            ->orderBy('code')
            ->get()
            ->map(fn (object $item): array => (array) $item)
            ->all();
        $migration = require database_path('migrations/2026_07_16_000004_align_supervisor_team_permissions.php');

        $migration->up();
        Permission::where('code', 'operations.view_team')->update([
            'name' => 'Nombre obsoleto',
            'description' => 'Descripcion obsoleta.',
            'module' => 'legacy',
        ]);
        $migration->up();
        $migration->up();

        $permission = Permission::where('code', 'operations.view_team')->firstOrFail();

        $this->assertSame('Ver equipo de trabajo', $permission->name);
        $this->assertSame('Permite consultar los operadores asignados directamente al supervisor autenticado.', $permission->description);
        $this->assertSame('operations', $permission->module);
        $this->assertSame(1, Permission::where('code', 'operations.view_team')->count());
        $this->assertSame(1, DB::table('auth.permission_role')->where('permission_id', $permission->id)->count());
        $this->assertRolePermission('ADMIN', 'operations.view_team', false);
        $this->assertRolePermission('SUPERVISOR', 'operations.view_team', true);
        $this->assertRolePermission('OPERADOR', 'operations.view_team', false);
        $this->assertRolePermission('CIUDADANO', 'operations.view_team', false);
        $this->assertRolePermission('SUPERVISOR', 'incidents.create', false);
        $this->assertRolePermission('SUPERVISOR', 'operations.view', false);
        $this->assertRolePermission('ADMIN', 'incidents.create', false);
        $this->assertRolePermission('ADMIN', 'operations.view', true);
        $this->assertRolePermission('ADMIN', 'operations.manage', true);
        $this->assertRolePermission('CIUDADANO', 'incidents.create', true);
        $this->assertRolePermission('OPERADOR', 'incidents.create', false);
        $this->assertSame(
            Permission::count() - 3,
            Role::where('code', 'ADMIN')->firstOrFail()->permissions()->count()
        );
        $this->assertSame(
            $permissions,
            DB::table('auth.permissions')
                ->where('code', '!=', 'operations.view_team')
                ->orderBy('code')
                ->get()
                ->map(fn (object $existingPermission): array => (array) $existingPermission)
                ->all()
        );
        $this->assertSame($unrelatedGrants, $this->unrelatedGrants($supervisor->id));
        $this->assertSame(
            $navigationItems,
            DB::table('auth.navigation_items')
                ->orderBy('code')
                ->get()
                ->map(fn (object $item): array => (array) $item)
                ->all()
        );

        $migration->down();
        $migration->down();

        $this->assertDatabaseMissing('auth.permissions', ['code' => 'operations.view_team']);
        $this->assertSame(0, DB::table('auth.permission_role')->where('permission_id', $permission->id)->count());
        $this->assertRolePermission('SUPERVISOR', 'incidents.create', true);
        $this->assertRolePermission('SUPERVISOR', 'operations.view', true);
        $this->assertRolePermission('ADMIN', 'incidents.create', false);
        $this->assertRolePermission('ADMIN', 'operations.view', true);
        $this->assertRolePermission('CIUDADANO', 'incidents.create', true);
        $this->assertSame(
            $permissions,
            DB::table('auth.permissions')
                ->orderBy('code')
                ->get()
                ->map(fn (object $existingPermission): array => (array) $existingPermission)
                ->all()
        );
        $this->assertSame($unrelatedGrants, $this->unrelatedGrants($supervisor->id));
        $this->assertSame(
            $navigationItems,
            DB::table('auth.navigation_items')
                ->orderBy('code')
                ->get()
                ->map(fn (object $item): array => (array) $item)
                ->all()
        );
    }

    private function assertRolePermission(string $roleCode, string $permissionCode, bool $expected): void
    {
        $role = Role::where('code', $roleCode)->firstOrFail();

        $this->assertSame(
            $expected,
            $role->permissions()->where('permissions.code', $permissionCode)->exists(),
            "Unexpected {$permissionCode} grant for {$roleCode}."
        );
    }

    private function unrelatedGrants(int $supervisorId): array
    {
        return DB::table('auth.permission_role as permission_role')
            ->join('auth.permissions as permissions', 'permissions.id', '=', 'permission_role.permission_id')
            ->where('permissions.code', '!=', 'operations.view_team')
            ->where(function ($query) use ($supervisorId): void {
                $query->where('permission_role.role_id', '!=', $supervisorId)
                    ->orWhereNotIn('permissions.code', ['incidents.create', 'operations.view']);
            })
            ->orderBy('permission_role.id')
            ->select('permission_role.*')
            ->get()
            ->map(fn (object $grant): array => (array) $grant)
            ->all();
    }
}
