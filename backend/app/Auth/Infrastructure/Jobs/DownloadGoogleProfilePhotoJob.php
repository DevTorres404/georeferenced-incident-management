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
            $user = $userRepository->findById($this->userId);
            if (! $user || ! $this->canReplaceWithGooglePhoto($user->profilePhoto)) {
                return;
            }

            $profilePhoto = $profilePhotoStorage->storeGoogleProfilePhoto($this->sourceUrl, $this->firebaseUid);
            $updated = $userRepository->updateProfilePhotoIfCurrentValue(
                $this->userId,
                $user->profilePhoto,
                $profilePhoto
            );

            $latestPhoto = $userRepository->findById($this->userId)?->profilePhoto;
            if (! $updated && $latestPhoto !== $profilePhoto) {
                $profilePhotoStorage->delete($profilePhoto);
            }
        } catch (Throwable) {
            // Silently fail if we can't download the photo
        }
    }

    private function canReplaceWithGooglePhoto(?string $currentPhoto): bool
    {
        return $currentPhoto === null
            || trim($currentPhoto) === ''
            || filter_var($currentPhoto, FILTER_VALIDATE_URL) !== false
            || str_starts_with($currentPhoto, 'profile-photos/google/');
    }
}
