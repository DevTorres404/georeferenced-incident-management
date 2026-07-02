<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class AttachmentData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $incidentId,
        public readonly int $userId,
        public readonly string $originalName,
        public readonly string $filePath,
        public readonly ?string $fileUrl,
        public readonly string $mimeType,
        public readonly int $fileSizeBytes,
        public readonly ?string $fileHash,
        public readonly ?string $createdAt,
        public readonly ?UserSummaryData $user = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'incident_id' => $this->incidentId,
            'user_id' => $this->userId,
            'original_name' => $this->originalName,
            'file_path' => $this->filePath,
            'file_url' => $this->fileUrl,
            'mime_type' => $this->mimeType,
            'file_size_bytes' => $this->fileSizeBytes,
            'file_hash' => $this->fileHash,
            'created_at' => $this->createdAt,
            'user' => $this->user,
        ];
    }
}
