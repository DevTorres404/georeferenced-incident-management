<?php

namespace App\Auth\Domain\Entities;

final class PasswordResetCode
{
    public function __construct(
        public readonly string $email,
        public readonly string $codeHash,
        public readonly ?string $createdAt,
        public readonly ?string $expiresAt,
        public readonly int $attempts,
        public readonly ?string $usedAt
    ) {}

    public function isUsed(): bool
    {
        return $this->usedAt !== null;
    }

    public function isExpired(): bool
    {
        return $this->expiresAt !== null && strtotime($this->expiresAt) <= time();
    }

    public function hasReachedAttemptLimit(int $maxAttempts): bool
    {
        return $this->attempts >= $maxAttempts;
    }
}
