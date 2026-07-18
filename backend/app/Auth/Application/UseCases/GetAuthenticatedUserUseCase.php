<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Domain\Entities\AuthUser;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class GetAuthenticatedUserUseCase
{
    public function __construct(private UserRepositoryInterface $userRepository) {}

    public function execute(int $userId): AuthUser
    {
        $user = $this->userRepository->loadProfile($userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        return $user;
    }
}
