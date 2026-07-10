<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\VerifyEmailInputData;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class VerifyEmailUseCase
{
    public function __construct(private UserRepositoryInterface $userRepository)
    {
    }

    public function execute(VerifyEmailInputData $input): void
    {
        $user = $this->userRepository->findById($input->userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if (! $user->isActive) {
            throw AuthException::accountInactive();
        }

        if (! hash_equals($input->hash, $user->emailVerificationHash())) {
            throw AuthException::invalidVerificationLink();
        }

        if (! $user->hasVerifiedEmail()) {
            $this->userRepository->markEmailAsVerified($input->userId);
        }
    }
}
