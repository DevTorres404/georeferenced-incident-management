<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class CountrySummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
        ];
    }
}
