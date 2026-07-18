<?php

namespace App\Users\Application\DTOs;

final class UserFiltersData
{
    public function __construct(
        public readonly ?string $search = null,
        public readonly ?string $roleCode = null,
        public readonly ?bool $isActive = null,
        public readonly int $perPage = 15
    ) {}
}
