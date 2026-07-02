<?php

namespace App\Audit\Infrastructure\Persistence\Repositories;

use App\Audit\Application\DTOs\AuditLogFiltersData;
use App\Audit\Application\DTOs\LoginAttemptFiltersData;
use App\Audit\Domain\Repositories\AuditRepositoryInterface;
use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Shared\Application\Results\PaginatedResult;

final class EloquentAuditRepository implements AuditRepositoryInterface
{
    public function logs(AuditLogFiltersData $filters): PaginatedResult
    {
        $query = AuditLog::with('user')->latest();

        if ($filters->table !== null && $filters->table !== '') {
            $query->where(function ($query) use ($filters): void {
                $query->where('auditable_type', 'ILIKE', "%{$filters->table}%")
                    ->orWhere('tags->table', $filters->table);
            });
        }

        if ($filters->tableId !== null) {
            $query->where('auditable_id', $filters->tableId);
        }

        if ($filters->userId !== null) {
            $query->where('user_id', $filters->userId);
        }

        if ($filters->action !== null && $filters->action !== '') {
            $query->where('event', $filters->action);
        }

        $result = $query->paginate($filters->perPage);

        return new PaginatedResult(
            items: $result->items(),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function loginAttempts(LoginAttemptFiltersData $filters): PaginatedResult
    {
        $query = LoginAttempt::with('user')->latest();

        if ($filters->email !== null && $filters->email !== '') {
            $query->where('email', $filters->email);
        }

        if ($filters->ipAddress !== null && $filters->ipAddress !== '') {
            $query->where('ip_address', $filters->ipAddress);
        }

        if ($filters->successful !== null) {
            $query->where('is_success', $filters->successful);
        }

        $result = $query->paginate($filters->perPage);

        return new PaginatedResult(
            items: $result->items(),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }
}
