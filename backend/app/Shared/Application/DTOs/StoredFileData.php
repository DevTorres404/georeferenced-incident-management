<?php

namespace App\Shared\Application\DTOs;

final class StoredFileData
{
    public function __construct(
        public readonly string $originalName,
        public readonly string $storagePath,
        public readonly string $mimeType,
        public readonly int $sizeInBytes,
        public readonly string $hash
    ) {}
}
