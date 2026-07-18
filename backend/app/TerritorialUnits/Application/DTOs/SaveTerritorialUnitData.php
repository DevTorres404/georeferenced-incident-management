<?php

namespace App\TerritorialUnits\Application\DTOs;

final class SaveTerritorialUnitData
{
    public function __construct(
        public readonly string $name,
        public readonly string $type,
        public readonly ?int $parentId = null,
        public readonly ?string $code = null,
        public readonly bool $isActive = true
    ) {}
}
