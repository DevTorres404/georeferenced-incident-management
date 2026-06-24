<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;

final class AttachmentMapper
{
    public function __construct(private UserSummaryMapper $userSummaryMapper)
    {
    }

    public function fromModel(IncidentAttachment $attachment): AttachmentData
    {
        return new AttachmentData(
            id: (int) $attachment->id,
            incidentId: (int) $attachment->incident_id,
            userId: (int) $attachment->user_id,
            originalName: $attachment->original_name,
            filePath: $attachment->file_path,
            mimeType: $attachment->mime_type,
            fileSizeBytes: (int) $attachment->file_size_bytes,
            fileHash: $attachment->file_hash,
            createdAt: $attachment->created_at?->toIso8601String(),
            user: $attachment->relationLoaded('user') && $attachment->user
                ? $this->userSummaryMapper->fromModel($attachment->user)
                : null
        );
    }
}
