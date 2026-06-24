<?php

namespace App\Users\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Users\Domain\Repositories\AccessControlRepositoryInterface;

final class EloquentAccessControlRepository implements AccessControlRepositoryInterface
{
    public function overview(): array
    {
        $roles = Role::activos()
            ->with('permissions')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => $this->mapRole($role))
            ->values()
            ->all();

        $permissions = Permission::orderBy('module')
            ->orderBy('code')
            ->get()
            ->map(fn (Permission $permission) => $this->mapPermission($permission))
            ->values();

        $users = User::with('roles')
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get()
            ->map(fn (User $user) => $this->mapUser($user))
            ->values()
            ->all();

        return [
            'roles' => $roles,
            'permissions' => $permissions->values()->all(),
            'permissions_by_module' => $permissions
                ->groupBy('module')
                ->map(fn ($items) => $items->values()->all())
                ->all(),
            'users' => $users,
        ];
    }

    public function syncRolePermissions(int $roleId, array $permissionCodes): array
    {
        $role = Role::findOrFail($roleId);
        $permissionIds = Permission::whereIn('code', $permissionCodes)->pluck('id')->all();

        $role->permissions()->sync($permissionIds);

        return $this->mapRole($role->fresh('permissions'));
    }

    private function mapRole(Role $role): array
    {
        return [
            'id' => (int) $role->id,
            'code' => $role->code,
            'name' => $role->name,
            'description' => $role->description,
            'is_active' => (bool) $role->is_active,
            'permissions' => $role->permissions
                ->map(fn (Permission $permission) => $this->mapPermission($permission))
                ->values()
                ->all(),
        ];
    }

    private function mapPermission(Permission $permission): array
    {
        return [
            'id' => (int) $permission->id,
            'code' => $permission->code,
            'name' => $permission->name,
            'description' => $permission->description,
            'module' => $permission->module,
        ];
    }

    private function mapUser(User $user): array
    {
        return [
            'id' => (int) $user->id,
            'name' => trim("{$user->first_name} {$user->last_name}"),
            'username' => $user->username,
            'email' => $user->email,
            'is_active' => (bool) $user->is_active,
            'roles' => $user->roles
                ->map(fn (Role $role) => [
                    'id' => (int) $role->id,
                    'code' => $role->code,
                    'name' => $role->name,
                ])
                ->values()
                ->all(),
        ];
    }
}
