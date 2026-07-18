<?php

namespace App\Audit\Application\DTOs;

final class AuditLogFiltersData
{
    public function __construct(
        public readonly ?string $table = null,
        public readonly ?int $tableId = null,
        public readonly ?int $userId = null,
        public readonly ?string $action = null,
        public readonly int $perPage = 25
    ) {}
}
