<?php

declare(strict_types=1);

namespace App\Catalogs\Application\DTOs;

readonly class CategoryRequestData
{
    public function __construct(
        public int $id,
        public int $incidentId,
        public int $requestedBy,
        public string $requestedByName,
        public string $incidentCode,
        public string $suggestedCategoryName,
        public ?string $suggestedCategoryDescription,
        public string $suggestedSubcategoryName,
        public ?string $suggestedIcon,
        public string $reason,
        public string $status,
        public ?int $resolvedBy,
        public ?int $createdCategoryId,
        public ?int $createdSubcategoryId,
        public ?string $adminComment,
        public ?string $resolvedAt,
        public string $createdAt,
    ) {}
}
