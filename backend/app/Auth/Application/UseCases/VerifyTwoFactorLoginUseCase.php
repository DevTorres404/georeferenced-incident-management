<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\TwoFactorAuthPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class VerifyTwoFactorLoginUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private TwoFactorAuthPort $twoFactorAuth,
        private SessionManagerPort $sessionManager
    ) {
    }

    public function execute(string $twoFactorToken, string $code): AuthActionResultData
    {
        $userId = $this->sessionManager->getUserIdFromTwoFactorToken($twoFactorToken);

        if (! $userId) {
            throw new \DomainException('Token de 2FA inválido o expirado.');
        }

        $user = $this->userRepository->findById($userId);

        if (! $user || ! $user->isTwoFactorEnabled()) {
            throw AuthException::invalidCredentials();
        }

        $isValid = $this->twoFactorAuth->verifyKey($user->twoFactorSecret, $code);

        if (! $isValid) {
            throw new \DomainException('El código proporcionado es incorrecto.');
        }

        $this->userRepository->updateLastAccess($user->id);
        
        $session = $this->sessionManager->createForUser($user->id, 'api-token');
        $profile = $this->userRepository->loadProfile($user->id);

        $this->sessionManager->deleteTwoFactorToken($twoFactorToken);

        return new AuthActionResultData(
            message: 'Inicio de sesion exitoso con 2FA.',
            user: $profile,
            session: $session
        );
    }
}
