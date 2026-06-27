<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class DisableTwoFactorUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository
    ) {
    }

    public function execute(int $userId): void
    {
        $user = $this->userRepository->findById($userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if (! $user->isTwoFactorEnabled()) {
            throw new \DomainException('La autenticación de dos factores no está habilitada.');
        }

        $this->userRepository->updateTwoFactorSecret($userId, null);
    }
}
