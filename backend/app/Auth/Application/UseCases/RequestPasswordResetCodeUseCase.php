<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\ForgotPasswordInputData;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Repositories\PasswordResetCodeRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class RequestPasswordResetCodeUseCase
{
    private const CODE_LENGTH = 6;
    private const EXPIRES_IN_MINUTES = 15;

    public function __construct(
        private UserRepositoryInterface $userRepository,
        private PasswordResetCodeRepositoryInterface $resetCodeRepository,
        private PasswordHasherPort $passwordHasher,
        private UserNotificationPort $notificationPort
    ) {
    }

    public function execute(ForgotPasswordInputData $input): void
    {
        $email = strtolower(trim($input->email));
        $user = $this->userRepository->findByEmail($email);

        if (! $user || $user->id === null || ! $user->isActive) {
            return;
        }

        $code = $this->generateCode();

        $this->resetCodeRepository->store(
            email: $email,
            codeHash: $this->passwordHasher->make($code),
            expiresAt: date('c', time() + (self::EXPIRES_IN_MINUTES * 60))
        );

        $this->notificationPort->sendPasswordResetCodeEmail(
            $user->id,
            $code,
            self::EXPIRES_IN_MINUTES
        );
    }

    private function generateCode(): string
    {
        return str_pad((string) random_int(0, (10 ** self::CODE_LENGTH) - 1), self::CODE_LENGTH, '0', STR_PAD_LEFT);
    }
}
