<?php

namespace App\Incidents\Application\DTOs;

final class IncidentTimelineData
{
    /**
     * @param  array<int, IncidentCycleTimelineData>  $cycles
     */
    public function __construct(
        public readonly int $incidentId,
        public readonly ?int $currentCycleNumber,
        public readonly array $cycles,
    ) {}
}
