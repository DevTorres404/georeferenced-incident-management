<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class TerritorialUnitSummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $type,
        public readonly string $fullPath
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'full_path' => $this->fullPath,
        ];
    }
}
