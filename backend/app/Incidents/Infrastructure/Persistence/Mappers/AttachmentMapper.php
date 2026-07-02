<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use Illuminate\Support\Facades\Storage;

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
            fileUrl: $this->resolveFileUrl($attachment->file_path),
            mimeType: $attachment->mime_type,
            fileSizeBytes: (int) $attachment->file_size_bytes,
            fileHash: $attachment->file_hash,
            createdAt: $attachment->created_at?->toIso8601String(),
            user: $attachment->relationLoaded('user') && $attachment->user
                ? $this->userSummaryMapper->fromModel($attachment->user)
                : null
        );
    }

    private function resolveFileUrl(?string $filePath): ?string
    {
        if (! is_string($filePath) || trim($filePath) === '') {
            return null;
        }

        $diskName = (string) config('filesystems.incident_disk', 'public');
        $disk = Storage::disk($diskName);
        $driver = (string) config("filesystems.disks.{$diskName}.driver", '');

        try {
            if ($driver === 's3' && method_exists($disk, 'temporaryUrl')) {
                return $disk->temporaryUrl($filePath, now()->addMinutes(30));
            }

            $url = $disk->url($filePath);
        } catch (\Throwable) {
            return null;
        }

        return is_string($url) && trim($url) !== '' ? $url : null;
    }
}
