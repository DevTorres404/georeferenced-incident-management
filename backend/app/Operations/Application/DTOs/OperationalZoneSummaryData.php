<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperationalZoneSummaryData implements JsonSerializable
{
    public function __construct(
        public readonly OperationalTerritoryData $zone,
        public readonly ?OperationalUserData $supervisor,
        public readonly int $maxOperators,
        public readonly int $activeOperatorsCount,
        public readonly int $activeIncidents,
        public readonly float $averageWorkloadPoints,
        public readonly array $provincesCovered
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'zone' => $this->zone,
            'supervisor' => $this->supervisor,
            'max_operators' => $this->maxOperators,
            'active_operators_count' => $this->activeOperatorsCount,
            'active_incidents' => $this->activeIncidents,
            'average_workload_points' => $this->averageWorkloadPoints,
            'provinces_covered' => $this->provincesCovered,
        ];
    }
}
