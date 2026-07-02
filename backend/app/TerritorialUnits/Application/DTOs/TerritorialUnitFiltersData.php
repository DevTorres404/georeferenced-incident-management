<?php

namespace App\TerritorialUnits\Application\DTOs;

final class TerritorialUnitFiltersData
{
    public function __construct(
        public readonly ?string $type = null,
        public readonly ?int $parentId = null,
        public readonly ?string $search = null,
        public readonly ?bool $isActive = true
    ) {
    }
}
