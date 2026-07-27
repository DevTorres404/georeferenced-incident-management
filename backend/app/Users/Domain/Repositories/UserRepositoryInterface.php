<?php

namespace App\Users\Domain\Repositories;

use App\Auth\Domain\Entities\AuthUser;
use App\Shared\Application\Results\PaginatedResult;
use App\Users\Application\DTOs\CreateManagedUserInputData;
use App\Users\Application\DTOs\SyncUserRolesInputData;
use App\Users\Application\DTOs\UpdateManagedUserInputData;
use App\Users\Application\DTOs\UserFiltersData;

interface UserRepositoryInterface
{
    public function paginate(UserFiltersData $filters): PaginatedResult;

    public function create(CreateManagedUserInputData $data): AuthUser;

    public function show(int $userId): AuthUser;

    public function update(int $userId, UpdateManagedUserInputData $data): AuthUser;

    public function delete(int $userId): void;

    public function syncRoles(SyncUserRolesInputData $data): AuthUser;

    public function resetTwoFactor(int $userId, int $actorId): AuthUser;
}
