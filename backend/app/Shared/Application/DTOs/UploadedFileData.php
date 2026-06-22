<?php

namespace App\Shared\Application\DTOs;

final class UploadedFileData
{
    public function __construct(
        public readonly string $originalName,
        public readonly string $mimeType,
        public readonly int $sizeInBytes,
        public readonly string $temporaryPath
    ) {
    }
}
