<?php

namespace App\Users\Domain\Repositories;

interface AccessControlRepositoryInterface
{
    /**
     * @return array<string, mixed>
     */
    public function overview(): array;

    /**
     * @param  array<int, string>  $permissionCodes
     * @return array<string, mixed>
     */
    public function syncRolePermissions(int $roleId, array $permissionCodes): array;

    /**
     * @return array<int, array<string, mixed>>
     */
    public function navigationForUser(int $userId): array;
}
