<?php

namespace App\Users\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\NavigationItem;
use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Users\Domain\Repositories\AccessControlRepositoryInterface;
use Illuminate\Support\Collection;

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
            'navigation_items' => $this->navigationOverview(),
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

    public function navigationForUser(int $userId): array
    {
        $user = User::with('roles.permissions')->findOrFail($userId);
        if (! $user->is_active) {
            return [];
        }

        $permissionCodes = $user->roles
            ->where('is_active', true)
            ->flatMap(fn (Role $role) => $role->permissions)
            ->pluck('code')
            ->filter()
            ->unique()
            ->values();

        return NavigationItem::query()
            ->whereNull('parent_id')
            ->where('active', true)
            ->with(['children' => fn ($query) => $query
                ->where('active', true)
                ->orderBy('sort_order')
                ->orderBy('label')])
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get()
            ->map(fn (NavigationItem $item) => $this->mapNavigationItem($item, $permissionCodes))
            ->filter()
            ->values()
            ->all();
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

    private function mapNavigationItem(NavigationItem $item, Collection $permissionCodes): ?array
    {
        $childItems = $item->relationLoaded('children') ? $item->children : collect();
        $children = $childItems
            ->map(fn (NavigationItem $child) => $this->mapNavigationItem($child, $permissionCodes))
            ->filter()
            ->values()
            ->all();

        if ($childItems->isNotEmpty()) {
            if ($children === []) {
                return null;
            }
        } elseif (! $this->canAccessNavigationItem($item, $permissionCodes)) {
            return null;
        }

        return [
            'id' => $item->code,
            'code' => $item->code,
            'label' => $item->label,
            'icon' => $item->icon,
            'route' => $item->route,
            'permission' => $item->permission_code,
            'sort_order' => (int) $item->sort_order,
            'children' => $children,
        ];
    }

    private function canAccessNavigationItem(NavigationItem $item, Collection $permissionCodes): bool
    {
        if ($item->permission_code === null || $item->permission_code === '') {
            return true;
        }

        return $permissionCodes->contains($item->permission_code);
    }

    private function navigationOverview(): array
    {
        return NavigationItem::query()
            ->whereNull('parent_id')
            ->with(['children' => fn ($query) => $query
                ->orderBy('sort_order')
                ->orderBy('label')])
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get()
            ->map(fn (NavigationItem $item) => $this->mapNavigationOverviewItem($item))
            ->values()
            ->all();
    }

    private function mapNavigationOverviewItem(NavigationItem $item): array
    {
        $childItems = $item->relationLoaded('children') ? $item->children : collect();

        return [
            'id' => (int) $item->id,
            'code' => $item->code,
            'label' => $item->label,
            'icon' => $item->icon,
            'route' => $item->route,
            'permission' => $item->permission_code,
            'sort_order' => (int) $item->sort_order,
            'active' => (bool) $item->active,
            'children' => $childItems
                ->map(fn (NavigationItem $child) => $this->mapNavigationOverviewItem($child))
                ->values()
                ->all(),
        ];
    }
}
