<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Catalogs\Application\DTOs\RoleData;

final class RoleMapper
{
    public function __construct(private PermissionMapper $permissionMapper) {}

    public function fromModel(Role $role): RoleData
    {
        $permissions = [];

        if ($role->relationLoaded('permissions')) {
            $permissions = $role->permissions
                ->map(fn ($permission) => $this->permissionMapper->fromModel($permission))
                ->toArray();
        }

        return new RoleData(
            id: (int) $role->id,
            code: $role->code,
            name: $role->name,
            description: $role->description,
            permissions: $permissions
        );
    }
}
