<?php

namespace App\Users\Application\UseCases;

use App\Auth\Domain\Entities\AuthUser;
use App\Shared\Application\Results\PaginatedResult;
use App\Users\Application\DTOs\CreateManagedUserInputData;
use App\Users\Application\DTOs\SyncUserRolesInputData;
use App\Users\Application\DTOs\UpdateManagedUserInputData;
use App\Users\Application\DTOs\UserFiltersData;
use App\Users\Domain\Repositories\UserRepositoryInterface;

final class UserManagementUseCase
{
    public function __construct(private UserRepositoryInterface $userRepository) {}

    public function paginate(UserFiltersData $filters): PaginatedResult
    {
        return $this->userRepository->paginate($filters);
    }

    public function create(CreateManagedUserInputData $data): AuthUser
    {
        return $this->userRepository->create($data);
    }

    public function show(int $userId): AuthUser
    {
        return $this->userRepository->show($userId);
    }

    public function update(int $userId, UpdateManagedUserInputData $data): AuthUser
    {
        return $this->userRepository->update($userId, $data);
    }

    public function delete(int $userId): void
    {
        $this->userRepository->delete($userId);
    }

    public function syncRoles(SyncUserRolesInputData $data): AuthUser
    {
        return $this->userRepository->syncRoles($data);
    }

    public function resetTwoFactor(int $userId, int $actorId): AuthUser
    {
        return $this->userRepository->resetTwoFactor($userId, $actorId);
    }
}
