<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\VerifyPasswordResetCodeInputData;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Domain\Entities\PasswordResetCode;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\PasswordResetCodeRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class VerifyPasswordResetCodeUseCase
{
    private const MAX_ATTEMPTS = 5;

    public function __construct(
        private UserRepositoryInterface $userRepository,
        private PasswordResetCodeRepositoryInterface $resetCodeRepository,
        private PasswordHasherPort $passwordHasher
    ) {
    }

    public function execute(VerifyPasswordResetCodeInputData $input): void
    {
        $this->assertValidCode(strtolower(trim($input->email)), $input->code);
    }

    public function assertValidCode(string $email, string $code): PasswordResetCode
    {
        $user = $this->userRepository->findByEmail($email);
        $resetCode = $this->resetCodeRepository->findByEmail($email);

        if (
            ! $user
            || ! $resetCode
            || $resetCode->isUsed()
            || $resetCode->isExpired()
            || $resetCode->hasReachedAttemptLimit(self::MAX_ATTEMPTS)
        ) {
            throw AuthException::invalidPasswordResetCode();
        }

        if (! $user->isActive) {
            throw AuthException::accountInactive();
        }

        if (! $this->passwordHasher->verify($code, $resetCode->codeHash)) {
            $this->resetCodeRepository->incrementAttempts($email);
            throw AuthException::invalidPasswordResetCode();
        }

        return $resetCode;
    }
}
