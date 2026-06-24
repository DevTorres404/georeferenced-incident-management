<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

final class CityData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $provinceId,
        public readonly string $name
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'province_id' => $this->provinceId,
            'name' => $this->name,
        ];
    }
}
