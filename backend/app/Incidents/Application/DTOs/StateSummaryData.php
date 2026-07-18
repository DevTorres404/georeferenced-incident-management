<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class StateSummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly ?string $color,
        public readonly bool $allowsEdition,
        public readonly bool $isFinalState
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'allows_edition' => $this->allowsEdition,
            'is_final_state' => $this->isFinalState,
        ];
    }
}
