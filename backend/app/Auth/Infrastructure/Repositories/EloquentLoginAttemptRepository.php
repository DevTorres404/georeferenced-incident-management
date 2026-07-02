<?php

namespace App\Auth\Infrastructure\Repositories;

use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Shared\Infrastructure\Notifications\AdminNotifier;

class EloquentLoginAttemptRepository implements LoginAttemptRepositoryInterface
{
    public function __construct(private AdminNotifier $adminNotifier)
    {
    }

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

        if (! $successful && $this->recentFailedAttempts($email, $ip) >= 3) {
            $this->adminNotifier->notify(
                title: 'Intentos fallidos de login',
                message: 'Se detectaron varios intentos fallidos de acceso.',
                type: 'STATUS_CHANGE'
            );
        }
    }

    private function recentFailedAttempts(string $email, string $ip): int
    {
        return LoginAttempt::where('is_success', false)
            ->where('created_at', '>=', now()->subMinutes(10))
            ->where(function ($query) use ($email, $ip): void {
                $query->where('email', $email)
                    ->orWhere('ip_address', $ip);
            })
            ->count();
    }
}
