<?php

namespace App\Incidents\Application\DTOs;

final class IncidentFiltersData
{
    public function __construct(
        public readonly ?int $stateId = null,
        public readonly ?array $stateIds = null,
        public readonly ?string $stateFilter = null,
        public readonly ?int $priorityId = null,
        public readonly ?int $categoryId = null,
        public readonly ?bool $mine = null,
        public readonly ?bool $assignedToMe = null,
        public readonly ?bool $overdue = null,
        public readonly ?string $search = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?float $radiusKm = null,
        public readonly ?int $perPage = null,
        public readonly ?string $sortBy = null,
        public readonly ?string $sortDirection = null,
    ) {
    }
}
