<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

final class ProvinceData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $countryId,
        public readonly string $name
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'country_id' => $this->countryId,
            'name' => $this->name,
        ];
    }
}
