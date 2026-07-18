<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperationalTerritoryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $type,
        public readonly ?string $code,
        public readonly string $fullPath
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'code' => $this->code,
            'full_path' => $this->fullPath,
        ];
    }
}
