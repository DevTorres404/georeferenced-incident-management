<?php

namespace App\Incidents\Application\DTOs;

final class ClassifyIncidentInputData
{
    public function __construct(
        public readonly int $categoryId,
        public readonly ?int $subcategoryId,
        public readonly string $reason
    ) {}
}
