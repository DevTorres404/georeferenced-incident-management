<?php

namespace App\Auth\Application\Ports;

use App\Auth\Application\DTOs\SessionTokenData;

interface SessionManagerPort
{
    public function createForUser(int $userId, string $name): SessionTokenData;

    public function revokeByTokenId(int $tokenId): void;

    public function createTwoFactorToken(int $userId): string;

    public function getUserIdFromTwoFactorToken(string $token): ?int;

    public function deleteTwoFactorToken(string $token): void;
}
