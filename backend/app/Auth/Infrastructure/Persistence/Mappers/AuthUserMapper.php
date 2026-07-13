<?php

namespace App\Auth\Infrastructure\Persistence\Mappers;

use App\Auth\Domain\Entities\AuthUser;
use App\Auth\Infrastructure\Persistence\Models\User;
use DateTimeInterface;
use Illuminate\Support\Carbon;

final class AuthUserMapper
{
    public function __construct(private AuthIdentityMapper $identityMapper) {}

    public function fromModel(User $user): AuthUser
    {
        $roles = $user->relationLoaded('roles')
            ? $user->roles->where('is_active', true)->values()
            : collect();
        $roleCodes = $roles->pluck('code')->filter()->values()->all();
        $permissionCodes = $roles
            ->flatMap(static fn ($role) => $role->permissions ?? [])
            ->pluck('code')
            ->filter()
            ->unique()
            ->values()
            ->all();

        $identities = $user->relationLoaded('identities')
            ? $user->identities->map(fn ($identity) => $this->identityMapper->fromModel($identity))->all()
            : [];

        return new AuthUser(
            id: (int) $user->id,
            firstName: $user->first_name,
            lastName: $user->last_name,
            username: $user->username,
            email: $user->email,
            passwordHash: $user->password,
            phone: $user->phone,
            profilePhoto: $user->profile_photo,
            isActive: (bool) $user->is_active,
            emailVerifiedAt: $this->toIso8601String($user->email_verified_at),
            lastAccessAt: $this->toIso8601String($user->last_login),
            twoFactorSecret: $user->two_factor_secret,
            twoFactorConfirmedAt: $this->toIso8601String($user->two_factor_confirmed_at),
            roleCodes: $roleCodes,
            permissionCodes: $permissionCodes,
            identities: $identities
        );
    }

    private function toIso8601String(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof DateTimeInterface) {
            return $value->format(DATE_ATOM);
        }

        return Carbon::parse((string) $value)->toIso8601String();
    }
}
