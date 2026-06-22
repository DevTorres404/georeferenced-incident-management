<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\DTOs\SessionTokenData;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Infrastructure\Persistence\Models\PersonalAccessToken;
use App\Auth\Infrastructure\Persistence\Models\User;

final class LaravelSessionManagerAdapter implements SessionManagerPort
{
    public function createForUser(int $userId, string $name): SessionTokenData
    {
        $user = User::findOrFail($userId);
        $minutes = max(1, (int) config('auth.api_token_expiration', 120));
        $expiresAt = now()->addMinutes($minutes);
        $token = $user->createToken($name, ['*'], $expiresAt);

        return new SessionTokenData(
            token: $token->plainTextToken,
            expiresAt: $expiresAt->toIso8601String(),
            expiresIn: $minutes * 60
        );
    }

    public function revokeByTokenId(int $tokenId): void
    {
        PersonalAccessToken::findOrFail($tokenId)->delete();
    }
}
