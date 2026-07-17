<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\IncidentCycleData;
use App\Incidents\Application\DTOs\IncidentCycleDetailData;
use App\Incidents\Application\DTOs\IncidentTimelineData;
use App\Incidents\Application\Ports\IncidentCycleReadRepositoryInterface;

final class IncidentCycleReadUseCase
{
    public function __construct(private IncidentCycleReadRepositoryInterface $cycleReadRepository) {}

    public function timeline(int $incidentId, bool $canSeeInternal): IncidentTimelineData
    {
        return $this->cycleReadRepository->timeline($incidentId, $canSeeInternal);
    }

    /**
     * @return array<int, IncidentCycleData>
     */
    public function list(int $incidentId): array
    {
        return $this->cycleReadRepository->list($incidentId);
    }

    public function detail(int $incidentId, int $cycleId, bool $canSeeInternal): IncidentCycleDetailData
    {
        return $this->cycleReadRepository->detail($incidentId, $cycleId, $canSeeInternal);
    }
}
