<?php

declare(strict_types=1);

namespace App\Catalogs\Application\DTOs;

readonly class CreatedCatalogPairData
{
    public function __construct(
        public int $categoryId,
        public int $subcategoryId,
    ) {}
}
