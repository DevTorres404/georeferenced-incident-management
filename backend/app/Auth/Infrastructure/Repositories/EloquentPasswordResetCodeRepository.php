<?php

namespace App\Auth\Infrastructure\Repositories;

use App\Auth\Domain\Entities\PasswordResetCode;
use App\Auth\Domain\Repositories\PasswordResetCodeRepositoryInterface;
use App\Auth\Infrastructure\Persistence\Models\PasswordResetToken;

final class EloquentPasswordResetCodeRepository implements PasswordResetCodeRepositoryInterface
{
    public function store(string $email, string $codeHash, string $expiresAt): PasswordResetCode
    {
        $token = PasswordResetToken::query()->updateOrCreate(
            ['email' => strtolower($email)],
            [
                'token' => $codeHash,
                'created_at' => now(),
                'expires_at' => $expiresAt,
                'attempts' => 0,
                'used_at' => null,
            ]
        );

        return $this->fromModel($token);
    }

    public function findByEmail(string $email): ?PasswordResetCode
    {
        $token = PasswordResetToken::query()
            ->where('email', strtolower($email))
            ->first();

        return $token ? $this->fromModel($token) : null;
    }

    public function incrementAttempts(string $email): void
    {
        PasswordResetToken::query()
            ->where('email', strtolower($email))
            ->increment('attempts');
    }

    public function markUsed(string $email): void
    {
        PasswordResetToken::query()
            ->where('email', strtolower($email))
            ->update([
                'used_at' => now(),
            ]);
    }

    public function deleteByEmail(string $email): void
    {
        PasswordResetToken::query()
            ->where('email', strtolower($email))
            ->delete();
    }

    private function fromModel(PasswordResetToken $token): PasswordResetCode
    {
        return new PasswordResetCode(
            email: (string) $token->email,
            codeHash: (string) $token->token,
            createdAt: $token->created_at?->toIso8601String(),
            expiresAt: $token->expires_at?->toIso8601String(),
            attempts: (int) $token->attempts,
            usedAt: $token->used_at?->toIso8601String()
        );
    }
}
