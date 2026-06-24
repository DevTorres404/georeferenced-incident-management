<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class CitySummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly ?ProvinceSummaryData $province = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'province' => $this->province,
        ];
    }
}
