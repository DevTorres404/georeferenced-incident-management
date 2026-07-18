<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\DTOs\SessionTokenData;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Infrastructure\Persistence\Models\PersonalAccessToken;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

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

    public function revokeOtherTokens(int $userId, ?int $exceptTokenId = null): void
    {
        PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $userId)
            ->when($exceptTokenId !== null, fn ($query) => $query->whereKeyNot($exceptTokenId))
            ->delete();
    }

    public function createTwoFactorToken(int $userId): string
    {
        $token = Str::random(64);
        Cache::put('2fa_token_'.$token, $userId, now()->addMinutes(10));

        return $token;
    }

    public function getUserIdFromTwoFactorToken(string $token): ?int
    {
        $userId = Cache::get('2fa_token_'.$token);

        return $userId ? (int) $userId : null;
    }

    public function deleteTwoFactorToken(string $token): void
    {
        Cache::forget('2fa_token_'.$token);
    }
}
