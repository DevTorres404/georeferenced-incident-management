<?php

namespace App\Auth\Infrastructure\Repositories;

use App\Auth\Application\DTOs\CreateUserInputData;
use App\Auth\Domain\Entities\AuthIdentity;
use App\Auth\Domain\Entities\AuthUser;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Auth\Infrastructure\Persistence\Mappers\AuthIdentityMapper;
use App\Auth\Infrastructure\Persistence\Mappers\AuthUserMapper;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Auth\Infrastructure\Persistence\Models\UserIdentity;

final class EloquentUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private AuthUserMapper $userMapper,
        private AuthIdentityMapper $identityMapper
    ) {
    }

    public function findByEmail(string $email): ?AuthUser
    {
        $user = User::where('email', $email)->first();

        return $user ? $this->userMapper->fromModel($user) : null;
    }

    public function findById(int $id): ?AuthUser
    {
        $user = User::find($id);

        return $user ? $this->userMapper->fromModel($user) : null;
    }

    public function create(CreateUserInputData $data): AuthUser
    {
        $user = User::create([
            'first_name' => $data->firstName,
            'last_name' => $data->lastName,
            'username' => $data->username,
            'email' => $data->email,
            'password' => $data->password,
            'phone' => $data->phone,
            'profile_photo' => $data->profilePhoto,
            'email_verified_at' => $data->emailVerifiedAt,
            'is_active' => $data->isActive,
        ]);

        return $this->userMapper->fromModel($user);
    }

    public function loadProfile(int $userId): ?AuthUser
    {
        $user = User::with(['roles.permissions', 'identities'])->find($userId);

        return $user ? $this->userMapper->fromModel($user) : null;
    }

    public function assignRoleByCode(int $userId, string $roleCode): void
    {
        $user = User::findOrFail($userId);
        $role = Role::where('code', $roleCode)->first();

        if (! $role) {
            return;
        }

        if ($user->roles()->exists()) {
            return;
        }

        $user->roles()->sync([
            $role->id => [
                'assigned_at' => now(),
            ],
        ]);
    }

    public function syncIdentity(
        int $userId,
        string $provider,
        ?string $providerUid,
        string $providerEmail,
        array $providerData = [],
        ?string $verifiedAt = null
    ): AuthIdentity {
        $identity = UserIdentity::updateOrCreate(
            [
                'user_id' => $userId,
                'provider' => $provider,
            ],
            [
                'provider_uid' => $providerUid,
                'provider_email' => strtolower($providerEmail),
                'verified_at' => $verifiedAt,
                'last_used_at' => now(),
                'provider_data' => $providerData ?: null,
            ]
        );

        return $this->identityMapper->fromModel($identity);
    }

    public function findIdentityByProvider(string $provider, string $providerUid): ?AuthIdentity
    {
        $identity = UserIdentity::query()
            ->where('provider', $provider)
            ->where('provider_uid', $providerUid)
            ->first();

        return $identity ? $this->identityMapper->fromModel($identity) : null;
    }

    public function markEmailAsVerified(int $userId): bool
    {
        return User::findOrFail($userId)->markEmailAsVerified();
    }

    public function updateUsername(int $userId, string $username): AuthUser
    {
        $user = User::findOrFail($userId);
        $user->update([
            'username' => trim($username),
        ]);

        return $this->userMapper->fromModel($user->fresh());
    }

    public function updateProfile(int $userId, string $firstName, string $lastName, string $username): AuthUser
    {
        $user = User::findOrFail($userId);
        $user->update([
            'first_name' => trim($firstName),
            'last_name' => trim($lastName),
            'username' => trim($username),
        ]);

        return $this->userMapper->fromModel($user->fresh());
    }

    public function updateLastAccess(int $userId, ?string $lastAccessAt = null): void
    {
        $user = User::findOrFail($userId);
        $user->last_login = $lastAccessAt ?? now()->toIso8601String();
        $user->save();
    }

    public function updateTwoFactorSecret(int $userId, ?string $secret, ?array $recoveryCodes = null): void
    {
        $user = User::findOrFail($userId);
        $user->two_factor_secret = $secret;
        if ($recoveryCodes !== null) {
            $user->two_factor_recovery_codes = json_encode($recoveryCodes);
        } else {
            $user->two_factor_recovery_codes = null;
        }
        $user->two_factor_confirmed_at = null; // resets confirmation
        $user->save();
    }

    public function confirmTwoFactor(int $userId): void
    {
        $user = User::findOrFail($userId);
        $user->two_factor_confirmed_at = now();
        $user->save();
    }
}
