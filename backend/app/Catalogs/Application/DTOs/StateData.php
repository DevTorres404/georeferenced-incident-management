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
        public readonly int $order
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'color' => $this->color,
            'order' => $this->order,
        ];
    }
}
