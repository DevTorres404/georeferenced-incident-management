<?php

declare(strict_types=1);

namespace App\Auth\Application\Ports;

interface ProfilePhotoStoragePort
{
    public function storeGoogleProfilePhoto(string $sourceUrl, string $providerUid): string;
}
