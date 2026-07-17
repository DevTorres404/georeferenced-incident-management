<?php

namespace App\Incidents\Application\DTOs;

final class IncidentCycleTimelineData
{
    /**
     * @param  array<int, array<string, mixed>>  $events
     */
    public function __construct(
        public readonly IncidentCycleData $cycle,
        public readonly array $events,
    ) {}
}
