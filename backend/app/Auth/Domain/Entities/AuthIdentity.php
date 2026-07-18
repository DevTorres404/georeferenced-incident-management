<?php

namespace App\Auth\Domain\Entities;

use JsonSerializable;

final class AuthIdentity implements JsonSerializable
{
    public function __construct(
        public readonly ?int $userId,
        public readonly string $provider,
        public readonly ?string $providerUid,
        public readonly string $providerEmail,
        public readonly ?string $verifiedAt,
        public readonly ?string $lastUsedAt,
        public readonly array $providerData = []
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'user_id' => $this->userId,
            'provider' => $this->provider,
            'provider_uid' => $this->providerUid,
            'provider_email' => $this->providerEmail,
            'verified_at' => $this->verifiedAt,
            'last_used_at' => $this->lastUsedAt,
            'provider_data' => $this->providerData,
        ];
    }
}
