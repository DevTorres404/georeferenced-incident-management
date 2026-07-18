<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

final class StateData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $code,
        public readonly string $name,
        public readonly ?string $color,
        public readonly int $order,
        public readonly bool $isInitialState,
        public readonly bool $isFinalState
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'color' => $this->color,
            'order' => $this->order,
            'is_initial_state' => $this->isInitialState,
            'is_final_state' => $this->isFinalState,
        ];
    }
}
