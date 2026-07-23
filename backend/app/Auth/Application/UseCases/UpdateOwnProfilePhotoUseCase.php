<?php

declare(strict_types=1);

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\Ports\ProfilePhotoStoragePort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Shared\Application\DTOs\UploadedFileData;
use Throwable;

final class UpdateOwnProfilePhotoUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private ProfilePhotoStoragePort $profilePhotoStorage
    ) {}

    public function execute(int $userId, UploadedFileData $fileData): AuthActionResultData
    {
        $user = $this->userRepository->findById($userId);
        if (! $user) {
            throw AuthException::userNotFound();
        }

        $newPath = $this->profilePhotoStorage->storeUploadedProfilePhoto($userId, $fileData);

        try {
            $this->userRepository->updateProfilePhoto($userId, $newPath);
        } catch (Throwable $exception) {
            $this->profilePhotoStorage->delete($newPath);
            throw $exception;
        }

        if ($user->profilePhoto !== $newPath) {
            $this->profilePhotoStorage->delete($user->profilePhoto);
        }

        $profile = $this->userRepository->loadProfile($userId);

        return new AuthActionResultData(
            message: 'Foto de perfil actualizada correctamente.',
            user: $profile
        );
    }
}
