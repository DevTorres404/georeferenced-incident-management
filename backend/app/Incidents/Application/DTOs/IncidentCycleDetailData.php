<?php

namespace App\Incidents\Application\DTOs;

final class IncidentCycleDetailData
{
    /**
     * @param  array<string, mixed>|null  $snapshot
     * @param  array<int, array<string, mixed>>  $stateHistory
     * @param  array<int, array<string, mixed>>  $comments
     * @param  array<int, array<string, mixed>>  $attachments
     */
    public function __construct(
        public readonly IncidentCycleData $cycle,
        public readonly ?array $snapshot,
        public readonly array $stateHistory,
        public readonly array $comments,
        public readonly array $attachments,
    ) {}
}
