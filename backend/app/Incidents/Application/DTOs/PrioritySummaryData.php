<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class PrioritySummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $level
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'level' => $this->level,
        ];
    }
}
