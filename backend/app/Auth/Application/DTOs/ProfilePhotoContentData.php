<?php

declare(strict_types=1);

namespace App\Auth\Application\DTOs;

final class ProfilePhotoContentData
{
    public function __construct(
        public readonly string $contents,
        public readonly string $mimeType,
        public readonly string $etag
    ) {}
}
