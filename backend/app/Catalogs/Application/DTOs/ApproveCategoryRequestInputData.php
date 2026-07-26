<?php

declare(strict_types=1);

namespace App\Catalogs\Application\DTOs;

readonly class ApproveCategoryRequestInputData
{
    public function __construct(
        public string $categoryName,
        public string $subcategoryName,
        public ?string $categoryDescription,
        public ?string $subcategoryDescription,
        public string $icon,
        public string $color,
        public ?string $adminComment,
    ) {}
}
