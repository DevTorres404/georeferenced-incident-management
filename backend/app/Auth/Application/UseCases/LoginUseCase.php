<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\DTOs\LoginInputData;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class LoginUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private LoginAttemptRepositoryInterface $attemptRepository,
        private PasswordHasherPort $passwordHasher,
        private SessionManagerPort $sessionManager
    ) {
    }

    public function execute(LoginInputData $input): AuthActionResultData
    {
        $user = $this->userRepository->findByEmail($input->email);

        if (! $user) {
            $this->attemptRepository->logAttempt(
                $input->email,
                null,
                false,
                'Usuario no encontrado',
                $input->ip,
                $input->userAgent
            );
            throw AuthException::invalidCredentials();
        }

        if (! $this->passwordHasher->verify($input->password, $user->passwordHash)) {
            $this->attemptRepository->logAttempt(
                $input->email,
                $user->id,
                false,
                'Contrasena incorrecta',
                $input->ip,
                $input->userAgent
            );
            throw AuthException::invalidCredentials();
        }

        if (! $user->isActive) {
            $this->attemptRepository->logAttempt(
                $input->email,
                $user->id,
                false,
                'Usuario inactivo',
                $input->ip,
                $input->userAgent
            );
            throw AuthException::inactiveUser();
        }

        $this->userRepository->updateLastAccess($user->id);
        $this->userRepository->syncIdentity(
            $user->id,
            'local',
            strtolower($user->email),
            $user->email,
            ['source' => 'email_password'],
            $user->emailVerifiedAt
        );

        $this->attemptRepository->logAttempt(
            $input->email,
            $user->id,
            true,
            null,
            $input->ip,
            $input->userAgent
        );

        $session = $this->sessionManager->createForUser($user->id, 'api-token');
        $profile = $this->userRepository->loadProfile($user->id);

        if (! $profile) {
            throw AuthException::userNotFound();
        }

        return new AuthActionResultData(
            message: 'Inicio de sesion exitoso.',
            user: $profile,
            session: $session
        );
    }
}
