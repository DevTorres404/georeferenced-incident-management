<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentMapPointData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly ?string $code,
        public readonly string $title,
        public readonly ?string $address,
        public readonly float $latitude,
        public readonly float $longitude,
        public readonly ?StateSummaryData $state,
        public readonly ?CategorySummaryData $category,
        public readonly ?PrioritySummaryData $priority,
        public readonly ?TerritorialUnitSummaryData $territorialUnit,
        public readonly ?string $createdAt
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'address' => $this->address,
            'address_reference' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'state' => $this->state,
            'category' => $this->category,
            'priority' => $this->priority,
            'territorial_unit' => $this->territorialUnit,
            'created_at' => $this->createdAt,
        ];
    }
}
