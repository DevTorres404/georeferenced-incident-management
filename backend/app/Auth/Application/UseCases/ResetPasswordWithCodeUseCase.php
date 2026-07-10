<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\ResetPasswordWithCodeInputData;
use App\Auth\Application\DTOs\VerifyPasswordResetCodeInputData;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\PasswordResetCodeRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class ResetPasswordWithCodeUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private PasswordResetCodeRepositoryInterface $resetCodeRepository,
        private PasswordHasherPort $passwordHasher,
        private SessionManagerPort $sessionManager,
        private UserNotificationPort $notificationPort,
        private VerifyPasswordResetCodeUseCase $verifyPasswordResetCodeUseCase
    ) {
    }

    public function execute(ResetPasswordWithCodeInputData $input): void
    {
        $email = strtolower(trim($input->email));

        $this->verifyPasswordResetCodeUseCase->execute(
            new VerifyPasswordResetCodeInputData(
                email: $email,
                code: $input->code
            )
        );

        $user = $this->userRepository->findByEmail($email);

        if (! $user || $user->id === null) {
            throw AuthException::invalidPasswordResetCode();
        }

        if (! $user->isActive) {
            throw AuthException::accountInactive();
        }

        $this->userRepository->updatePasswordHash(
            $user->id,
            $this->passwordHasher->make($input->password)
        );

        $this->resetCodeRepository->markUsed($email);
        $this->sessionManager->revokeOtherTokens($user->id);
        $this->notificationPort->sendPasswordResetCompletedEmail($user->id);
    }
}
