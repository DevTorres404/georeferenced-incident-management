<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\DTOs\UserSummaryData;

final class UserSummaryMapper
{
    public function fromModel(User $user): UserSummaryData
    {
        return new UserSummaryData(
            id: (int) $user->id,
            firstName: $user->first_name,
            lastName: $user->last_name,
            email: $user->email,
            roleName: $user->relationLoaded('roles')
                ? $user->roles
                    ->where('is_active', true)
                    ->first()?->name
                : null
        );
    }
}
