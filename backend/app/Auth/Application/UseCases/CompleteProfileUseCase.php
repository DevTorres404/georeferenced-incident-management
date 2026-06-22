<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\DTOs\CompleteProfileInputData;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class CompleteProfileUseCase
{
    public function __construct(private UserRepositoryInterface $userRepository)
    {
    }

    public function execute(CompleteProfileInputData $input): AuthActionResultData
    {
        $user = $this->userRepository->findById($input->userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if (! $user->hasVerifiedEmail()) {
            throw AuthException::emailMustBeVerified();
        }

        $user = $this->userRepository->updateUsername($input->userId, $input->username);
        $profile = $this->userRepository->loadProfile($user->id) ?? $user;

        return new AuthActionResultData(
            message: 'Perfil completado correctamente.',
            user: $profile
        );
    }
}
