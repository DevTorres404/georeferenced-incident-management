<?php

declare(strict_types=1);

namespace App\Audit\Infrastructure\Services;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use Illuminate\Support\Facades\Auth;

final class AuditRecorder
{
    /**
     * @param  array<string, mixed>  $oldValues
     * @param  array<string, mixed>  $newValues
     */
    public function recordChange(
        string $auditableType,
        int $auditableId,
        array $oldValues,
        array $newValues,
        ?int $actorId = null,
        ?string $table = null
    ): void {
        if ($oldValues === $newValues) {
            return;
        }

        AuditLog::create([
            'auditable_type' => $auditableType,
            'auditable_id' => $auditableId,
            'event' => 'updated',
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'url' => app()->runningInConsole() ? null : request()?->fullUrl(),
            'user_id' => $actorId ?? Auth::id(),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'tags' => $table === null ? null : ['table' => $table],
        ]);
    }
}
