<?php

namespace App\Incidents\Application\DTOs;

final class IncidentCycleData
{
    public function __construct(
        public readonly int $id,
        public readonly int $cycleNumber,
        public readonly string $status,
        public readonly ?string $openedAt,
        public readonly ?string $openedBy,
        public readonly ?string $reopeningReason,
        public readonly ?string $resolvedAt,
        public readonly ?string $resolvedBy,
        public readonly ?string $resolutionDescription,
        public readonly ?string $closedAt,
        public readonly ?string $closedBy,
    ) {}
}
