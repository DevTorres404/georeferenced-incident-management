<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\Ports\TwoFactorAuthPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class ConfirmTwoFactorUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private TwoFactorAuthPort $twoFactorAuth
    ) {}

    public function execute(int $userId, string $code): void
    {
        $user = $this->userRepository->findById($userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if (! $user->twoFactorSecret) {
            throw new \DomainException('La autenticación de dos factores no ha sido inicializada.');
        }

        if ($user->isTwoFactorEnabled()) {
            throw new \DomainException('La autenticación de dos factores ya está habilitada.');
        }

        $isValid = $this->twoFactorAuth->verifyKey($user->twoFactorSecret, $code);

        if (! $isValid) {
            throw new \DomainException('El código proporcionado es inválido.');
        }

        $this->userRepository->confirmTwoFactor($userId);
    }
}
