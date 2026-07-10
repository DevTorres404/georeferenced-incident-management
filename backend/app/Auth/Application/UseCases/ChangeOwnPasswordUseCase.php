<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\ChangePasswordInputData;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class ChangeOwnPasswordUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private PasswordHasherPort $passwordHasher,
        private SessionManagerPort $sessionManager,
        private UserNotificationPort $notificationPort
    ) {
    }

    public function execute(ChangePasswordInputData $input): void
    {
        $user = $this->userRepository->findById($input->userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if (! $this->passwordHasher->verify($input->currentPassword, $user->passwordHash)) {
            throw AuthException::invalidCurrentPassword();
        }

        if ($this->passwordHasher->verify($input->newPassword, $user->passwordHash)) {
            throw AuthException::passwordUnchanged();
        }

        $this->userRepository->updatePasswordHash(
            $input->userId,
            $this->passwordHasher->make($input->newPassword)
        );

        $this->sessionManager->revokeOtherTokens($input->userId, $input->currentTokenId);
        $this->notificationPort->sendPasswordChangedEmail($input->userId);
    }
}
