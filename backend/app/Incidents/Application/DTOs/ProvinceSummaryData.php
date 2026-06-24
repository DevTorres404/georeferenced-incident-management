<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class ProvinceSummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly ?CountrySummaryData $country = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'country' => $this->country,
        ];
    }
}
