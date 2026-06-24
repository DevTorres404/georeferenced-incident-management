<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Catalogs\Application\DTOs\PermissionData;

final class PermissionMapper
{
    public function fromModel(Permission $permission): PermissionData
    {
        return new PermissionData(
            id: (int) $permission->id,
            code: $permission->code,
            name: $permission->name,
            description: $permission->description ?? '',
            module: $permission->module
        );
    }
}
