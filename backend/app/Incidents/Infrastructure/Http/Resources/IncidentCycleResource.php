<?php

namespace App\Incidents\Infrastructure\Http\Resources;

use App\Incidents\Application\DTOs\IncidentCycleData;
use App\Incidents\Application\DTOs\IncidentCycleTimelineData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class IncidentCycleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return self::fromData($this->resource);
    }

    public static function fromData(IncidentCycleData $cycle): array
    {
        return [
            'id' => $cycle->id,
            'cycle_number' => $cycle->cycleNumber,
            'status' => $cycle->status,
            'opened_at' => $cycle->openedAt,
            'opened_by' => $cycle->openedBy,
            'reopening_reason' => $cycle->reopeningReason,
            'resolved_at' => $cycle->resolvedAt,
            'resolved_by' => $cycle->resolvedBy,
            'resolution_description' => $cycle->resolutionDescription,
            'closed_at' => $cycle->closedAt,
            'closed_by' => $cycle->closedBy,
        ];
    }

    public static function timeline(IncidentCycleTimelineData $cycle): array
    {
        $summary = self::fromData($cycle->cycle);

        return [
            'id' => $summary['id'],
            'cycle_number' => $summary['cycle_number'],
            'status' => $summary['status'],
            'events' => $cycle->events,
        ];
    }

    public static function snapshotForCaller(?array $snapshot, bool $canSeeInternal): ?array
    {
        if ($snapshot === null) {
            return $snapshot;
        }

        $snapshot['attachments'] = array_map(
            static fn (array $attachment): array => array_intersect_key($attachment, array_flip([
                'id', 'file_name', 'mime_type', 'file_size_bytes', 'uploaded_at', 'uploaded_by', 'uploaded_by_name',
            ])),
            $snapshot['attachments'] ?? []
        );

        if (! $canSeeInternal) {
            $snapshot['comments'] = array_values(array_filter(
                $snapshot['comments'] ?? [],
                fn (array $comment): bool => ! ($comment['is_internal'] ?? false)
            ));
        }

        return $snapshot;
    }
}
