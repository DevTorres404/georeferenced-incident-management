<?php

namespace App\Auth\Infrastructure\Jobs;

use App\Auth\Application\Ports\ProfilePhotoStoragePort;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

final class DownloadGoogleProfilePhotoJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly int $userId,
        public readonly string $sourceUrl,
        public readonly string $firebaseUid
    ) {}

    public function handle(
        ProfilePhotoStoragePort $profilePhotoStorage,
        UserRepositoryInterface $userRepository
    ): void {
        try {
            $profilePhoto = $profilePhotoStorage->storeGoogleProfilePhoto($this->sourceUrl, $this->firebaseUid);
            if ($profilePhoto !== null) {
                $userRepository->updateProfilePhoto($this->userId, $profilePhoto);
            }
        } catch (Throwable) {
            // Silently fail if we can't download the photo
        }
    }
}
