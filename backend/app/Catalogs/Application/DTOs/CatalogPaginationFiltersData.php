<?php

namespace App\Catalogs\Application\DTOs;

final class CatalogPaginationFiltersData
{
    public function __construct(
        public readonly int $perPage = 50,
        public readonly ?bool $isActive = null
    ) {
    }
}
