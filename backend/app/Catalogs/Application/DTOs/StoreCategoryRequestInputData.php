<?php

declare(strict_types=1);

namespace App\Catalogs\Application\DTOs;

readonly class StoreCategoryRequestInputData
{
    public function __construct(
        public int $incidentId,
        public string $suggestedCategoryName,
        public string $suggestedCategoryDescription,
        public string $suggestedSubcategoryName,
        public string $reason,
        public ?string $suggestedIcon = null,
    ) {}
}
