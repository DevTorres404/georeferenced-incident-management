<?php

namespace App\Incidents\Domain\Entities;

use JsonSerializable;

final class IncidentState implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly ?string $name,
        public readonly bool $allowsEdition,
        public readonly bool $isFinal
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'allows_edition' => $this->allowsEdition,
            'is_final_state' => $this->isFinal,
        ];
    }
}
