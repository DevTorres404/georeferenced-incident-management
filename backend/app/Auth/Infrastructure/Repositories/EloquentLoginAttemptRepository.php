<?php

namespace App\Auth\Infrastructure\Repositories;

use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;

class EloquentLoginAttemptRepository implements LoginAttemptRepositoryInterface
{
    /**
     * {@inheritdoc}
     */
    public function logAttempt(
        string $email,
        ?int $userId,
        bool $successful,
        ?string $failReason,
        string $ip,
        ?string $userAgent
    ): void {
        LoginAttempt::create([
            'email' => $email,
            'user_id' => $userId,
            'is_success' => $successful,
            'failure_reason' => $failReason,
            'ip_address' => $ip,
            'user_agent' => $userAgent,
        ]);
    }
}

