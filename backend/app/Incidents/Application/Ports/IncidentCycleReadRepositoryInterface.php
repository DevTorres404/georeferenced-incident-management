<?php

namespace App\Incidents\Application\Ports;

use App\Incidents\Application\DTOs\IncidentCycleData;
use App\Incidents\Application\DTOs\IncidentCycleDetailData;
use App\Incidents\Application\DTOs\IncidentTimelineData;

interface IncidentCycleReadRepositoryInterface
{
    public function timeline(int $incidentId, bool $canSeeInternal): IncidentTimelineData;

    /**
     * @return array<int, IncidentCycleData>
     */
    public function list(int $incidentId): array;

    public function detail(int $incidentId, int $cycleId, bool $canSeeInternal): IncidentCycleDetailData;
}
