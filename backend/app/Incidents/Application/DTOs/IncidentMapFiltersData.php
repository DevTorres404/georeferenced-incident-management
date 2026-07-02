<?php

namespace App\Incidents\Application\DTOs;

final class IncidentMapFiltersData
{
    public function __construct(
        public readonly ?int $stateId = null,
        public readonly ?int $priorityId = null,
        public readonly ?int $categoryId = null,
        public readonly ?bool $mine = null,
        public readonly ?bool $assignedToMe = null,
        public readonly ?string $search = null,
        public readonly ?float $minLatitude = null,
        public readonly ?float $maxLatitude = null,
        public readonly ?float $minLongitude = null,
        public readonly ?float $maxLongitude = null,
        public readonly int $limit = 500
    ) {
    }
}
