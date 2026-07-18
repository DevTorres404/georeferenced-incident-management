<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\DTOs\UpdateOwnProfileInputData;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class UpdateOwnProfileUseCase
{
    public function __construct(private UserRepositoryInterface $userRepository) {}

    public function execute(UpdateOwnProfileInputData $input): AuthActionResultData
    {
        $user = $this->userRepository->findById($input->userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        $user = $this->userRepository->updateProfile(
            $input->userId,
            $input->firstName,
            $input->lastName,
            $input->username
        );

        $profile = $this->userRepository->loadProfile($user->id) ?? $user;

        return new AuthActionResultData(
            message: 'Perfil actualizado correctamente.',
            user: $profile
        );
    }
}
