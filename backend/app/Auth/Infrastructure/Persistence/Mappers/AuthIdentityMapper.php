<?php

namespace App\Auth\Infrastructure\Persistence\Mappers;

use App\Auth\Domain\Entities\AuthIdentity;
use App\Auth\Infrastructure\Persistence\Models\UserIdentity;

final class AuthIdentityMapper
{
    public function fromModel(UserIdentity $identity): AuthIdentity
    {
        return new AuthIdentity(
            userId: $identity->user_id ? (int) $identity->user_id : null,
            provider: $identity->provider,
            providerUid: $identity->provider_uid,
            providerEmail: $identity->provider_email,
            verifiedAt: $identity->verified_at?->toIso8601String(),
            lastUsedAt: $identity->last_used_at?->toIso8601String(),
            providerData: $identity->provider_data ?? []
        );
    }
}
