<?php

namespace App\Auth\Application\Ports;

use App\Auth\Application\DTOs\SessionTokenData;

interface SessionManagerPort
{
    public function createForUser(int $userId, string $name): SessionTokenData;

    public function revokeByTokenId(int $tokenId): void;
}
