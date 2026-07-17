<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\IncidentCycleData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;

final class IncidentCycleReadMapper
{
    public function cycle(IncidentCycle $cycle): IncidentCycleData
    {
        return new IncidentCycleData(
            id: (int) $cycle->id,
            cycleNumber: (int) $cycle->cycle_number,
            status: $cycle->status(),
            openedAt: $cycle->opened_at?->toISOString(),
            openedBy: $cycle->openedBy?->getNombreCompletoAttribute(),
            reopeningReason: $cycle->reopening_reason,
            resolvedAt: $cycle->resolved_at?->toISOString(),
            resolvedBy: $cycle->resolvedBy?->getNombreCompletoAttribute(),
            resolutionDescription: $cycle->resolution_description,
            closedAt: $cycle->closed_at?->toISOString(),
            closedBy: $cycle->closedBy?->getNombreCompletoAttribute(),
        );
    }

    public function snapshot(?array $snapshot, bool $canSeeInternal): ?array
    {
        if ($snapshot === null) {
            return null;
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
                static fn (array $comment): bool => ! ($comment['is_internal'] ?? false)
            ));
        }

        return $snapshot;
    }
}
