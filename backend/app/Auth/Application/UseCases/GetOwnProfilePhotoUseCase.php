<?php

declare(strict_types=1);

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\ProfilePhotoContentData;
use App\Auth\Application\Ports\ProfilePhotoStoragePort;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class GetOwnProfilePhotoUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private ProfilePhotoStoragePort $profilePhotoStorage
    ) {}

    public function execute(int $userId): ?ProfilePhotoContentData
    {
        $storagePath = $this->userRepository->findById($userId)?->profilePhoto;

        return $storagePath ? $this->profilePhotoStorage->read($storagePath) : null;
    }
}
