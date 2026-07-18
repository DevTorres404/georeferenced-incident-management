<?php

namespace App\Auth\Application\DTOs;

use JsonSerializable;

final class SessionTokenData implements JsonSerializable
{
    public function __construct(
        public readonly string $token,
        public readonly string $expiresAt,
        public readonly int $expiresIn
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'token' => $this->token,
            'expires_at' => $this->expiresAt,
            'expires_in' => $this->expiresIn,
        ];
    }
}
