<?php

namespace App\Incidents\Application\DTOs;

final class StoreIncidentInputData
{
    public function __construct(
        public readonly string $title,
        public readonly string $description,
        public readonly int $categoryId,
        public readonly ?int $priorityId,
        public readonly ?int $subcategoryId = null,
        public readonly ?string $address = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?int $territorialUnitId = null,
        public readonly ?string $resolutionDate = null
    ) {}
}
