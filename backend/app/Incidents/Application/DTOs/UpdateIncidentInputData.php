<?php

namespace App\Incidents\Application\DTOs;

final class UpdateIncidentInputData
{
    public function __construct(
        public readonly ?string $title = null,
        public readonly ?string $description = null,
        public readonly ?int $categoryId = null,
        public readonly ?int $priorityId = null,
        public readonly ?int $cityId = null,
        public readonly ?int $subcategoryId = null,
        public readonly ?string $address = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?string $resolutionDate = null
    ) {
    }
}
