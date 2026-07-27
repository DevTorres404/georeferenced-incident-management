<?php

namespace App\Users\Infrastructure\Persistence\Repositories;

use App\Audit\Infrastructure\Services\AuditRecorder;
use App\Auth\Infrastructure\Persistence\Models\NavigationItem;
use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Users\Application\DTOs\SyncRoleAccessInputData;
use App\Users\Domain\Repositories\AccessControlRepositoryInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class EloquentAccessControlRepository implements AccessControlRepositoryInterface
{
    public function __construct(private AuditRecorder $auditRecorder) {}

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
        $previousPermissionCodes = $role->permissions()->pluck('code')->sort()->values()->all();
        $permissionIds = Permission::whereIn('code', $permissionCodes)->pluck('id')->all();

        $role->permissions()->sync($permissionIds);

        $currentPermissionCodes = $role->permissions()->pluck('code')->sort()->values()->all();
        $this->auditRecorder->recordChange(
            Role::class,
            (int) $role->id,
            ['permissions' => $previousPermissionCodes],
            ['permissions' => $currentPermissionCodes],
            table: $role->getTable()
        );

        return $this->mapRole($role->fresh('permissions'));
    }

    public function syncRoleAccess(SyncRoleAccessInputData $data): array
    {
        return DB::transaction(function () use ($data): array {
            $role = Role::findOrFail($data->roleId);
            $previousPermissionCodes = $role->permissions()->pluck('code')->sort()->values()->all();
            $previousNavigationCodes = $this->visibleNavigationCodesForRole($role->code);
            $permissionIds = Permission::whereIn('code', $data->permissionCodes)->pluck('id')->all();

            $role->permissions()->sync($permissionIds);
            $this->syncNavigationVisibilityForRole($role->code, $data->navigationItemCodes);

            $currentPermissionCodes = $role->permissions()->pluck('code')->sort()->values()->all();
            $currentNavigationCodes = $this->visibleNavigationCodesForRole($role->code);
            $this->auditRecorder->recordChange(
                Role::class,
                (int) $role->id,
                [
                    'permissions' => $previousPermissionCodes,
                    'navigation_items' => $previousNavigationCodes,
                ],
                [
                    'permissions' => $currentPermissionCodes,
                    'navigation_items' => $currentNavigationCodes,
                ],
                table: $role->getTable()
            );

            return [
                'role' => $this->mapRole($role->fresh('permissions')),
                'navigation_items' => $this->navigationOverview(),
            ];
        });
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
        $roleCodes = $user->roles
            ->where('is_active', true)
            ->pluck('code')
            ->filter()
            ->map(fn (string $code) => strtoupper($code))
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
            ->map(fn (NavigationItem $item) => $this->mapNavigationItem($item, $permissionCodes, $roleCodes))
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

    private function mapNavigationItem(
        NavigationItem $item,
        Collection $permissionCodes,
        Collection $roleCodes
    ): ?array {
        if (! $this->isVisibleForRoles($item, $roleCodes)) {
            return null;
        }

        $childItems = $item->relationLoaded('children') ? $item->children : collect();
        $children = $childItems
            ->map(fn (NavigationItem $child) => $this->mapNavigationItem($child, $permissionCodes, $roleCodes))
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

    private function isVisibleForRoles(NavigationItem $item, Collection $roleCodes): bool
    {
        if ($item->allowed_roles === null) {
            return true;
        }

        $allowedRoles = collect($item->allowed_roles)
            ->filter()
            ->map(fn (string $code) => strtoupper($code));

        return $allowedRoles->intersect($roleCodes)->isNotEmpty();
    }

    /**
     * @param  array<int, string>  $selectedNavigationCodes
     */
    private function syncNavigationVisibilityForRole(string $roleCode, array $selectedNavigationCodes): void
    {
        $normalizedRoleCode = strtoupper($roleCode);
        $selectedCodes = collect($selectedNavigationCodes)->map(fn (string $code) => trim($code))->filter();
        $activeRoleCodes = Role::activos()
            ->pluck('code')
            ->map(fn (string $code) => strtoupper($code))
            ->unique()
            ->values();

        NavigationItem::query()
            ->whereNull('route')
            ->whereNotNull('allowed_roles')
            ->update(['allowed_roles' => null]);

        NavigationItem::query()
            ->where('active', true)
            ->whereNotNull('route')
            ->lockForUpdate()
            ->get()
            ->each(function (NavigationItem $item) use (
                $activeRoleCodes,
                $normalizedRoleCode,
                $selectedCodes
            ): void {
                $allowedRoles = $item->allowed_roles === null
                    ? $activeRoleCodes->collect()
                    : collect($item->allowed_roles)
                        ->map(fn (string $code) => strtoupper($code))
                        ->filter()
                        ->unique()
                        ->values();

                if ($selectedCodes->contains($item->code)) {
                    $allowedRoles->push($normalizedRoleCode);
                } else {
                    $allowedRoles = $allowedRoles->reject(
                        fn (string $code) => $code === $normalizedRoleCode
                    );
                }

                $allowedRoles = $allowedRoles->unique()->sort()->values();
                $allowsEveryActiveRole = $activeRoleCodes->every(
                    fn (string $code) => $allowedRoles->contains($code)
                );

                $item->update([
                    'allowed_roles' => $allowsEveryActiveRole ? null : $allowedRoles->all(),
                ]);
            });
    }

    /**
     * @return array<int, string>
     */
    private function visibleNavigationCodesForRole(string $roleCode): array
    {
        $roleCodes = collect([strtoupper($roleCode)]);

        return NavigationItem::query()
            ->where('active', true)
            ->whereNotNull('route')
            ->orderBy('code')
            ->get()
            ->filter(fn (NavigationItem $item) => $this->isVisibleForRoles($item, $roleCodes))
            ->pluck('code')
            ->values()
            ->all();
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
            'allowed_roles' => $item->allowed_roles,
            'sort_order' => (int) $item->sort_order,
            'active' => (bool) $item->active,
            'children' => $childItems
                ->map(fn (NavigationItem $child) => $this->mapNavigationOverviewItem($child))
                ->values()
                ->all(),
        ];
    }
}
