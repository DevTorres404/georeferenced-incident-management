<?php

namespace App\Users\Application\UseCases;

use App\Users\Domain\Repositories\AccessControlRepositoryInterface;

final class AccessControlUseCase
{
    public function __construct(private AccessControlRepositoryInterface $accessControlRepository)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(): array
    {
        return $this->accessControlRepository->overview();
    }

    /**
     * @param array<int, string> $permissionCodes
     * @return array<string, mixed>
     */
    public function syncRolePermissions(int $roleId, array $permissionCodes): array
    {
        return $this->accessControlRepository->syncRolePermissions($roleId, $permissionCodes);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function navigationForUser(int $userId): array
    {
        return $this->accessControlRepository->navigationForUser($userId);
    }
}
