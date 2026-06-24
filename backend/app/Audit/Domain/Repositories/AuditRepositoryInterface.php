<?php

namespace App\Audit\Domain\Repositories;

use App\Audit\Application\DTOs\AuditLogFiltersData;
use App\Audit\Application\DTOs\LoginAttemptFiltersData;
use App\Shared\Application\Results\PaginatedResult;

interface AuditRepositoryInterface
{
    public function logs(AuditLogFiltersData $filters): PaginatedResult;

    public function loginAttempts(LoginAttemptFiltersData $filters): PaginatedResult;
}
