<?php

declare(strict_types=1);

namespace App\Auth\Application\Ports;

use App\Auth\Application\DTOs\ProfilePhotoContentData;
use App\Shared\Application\DTOs\UploadedFileData;

interface ProfilePhotoStoragePort
{
    public function storeGoogleProfilePhoto(string $sourceUrl, string $providerUid): string;

    public function storeUploadedProfilePhoto(int $userId, UploadedFileData $fileData): string;

    public function read(string $storagePath): ?ProfilePhotoContentData;

    public function delete(?string $storagePath): void;
}
