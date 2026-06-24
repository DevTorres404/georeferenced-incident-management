<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

final class CountryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $isoCode
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'iso_code' => $this->isoCode,
        ];
    }
}
