<?php

namespace App\Auth\Infrastructure\Jobs;

use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

final class LogSuccessfulLoginAttemptJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly string $email,
        public readonly int $userId,
        public readonly string $ip,
        public readonly ?string $userAgent
    ) {}

    public function handle(): void
    {
        LoginAttempt::create([
            'email' => $this->email,
            'user_id' => $this->userId,
            'is_success' => true,
            'failure_reason' => null,
            'ip_address' => $this->ip,
            'user_agent' => $this->userAgent,
        ]);
    }
}
