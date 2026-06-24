<?php

namespace App\Audit\Application\UseCases;

use App\Audit\Application\DTOs\AuditLogFiltersData;
use App\Audit\Application\DTOs\LoginAttemptFiltersData;
use App\Shared\Application\Results\PaginatedResult;
use App\Audit\Domain\Repositories\AuditRepositoryInterface;

final class AuditQueryUseCase
{
    public function __construct(private AuditRepositoryInterface $auditRepository)
    {
    }

    public function logs(AuditLogFiltersData $filters): PaginatedResult
    {
        return $this->auditRepository->logs($filters);
    }

    public function loginAttempts(LoginAttemptFiltersData $filters): PaginatedResult
    {
        return $this->auditRepository->loginAttempts($filters);
    }
}
