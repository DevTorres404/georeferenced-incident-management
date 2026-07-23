<?php

namespace App\Auth\Domain\Repositories;

use App\Auth\Application\DTOs\CreateUserInputData;
use App\Auth\Domain\Entities\AuthIdentity;
use App\Auth\Domain\Entities\AuthUser;

interface UserRepositoryInterface
{
    public function findByEmail(string $email): ?AuthUser;

    public function findById(int $id): ?AuthUser;

    public function findTrashedByEmail(string $email): ?AuthUser;

    public function create(CreateUserInputData $data): AuthUser;

    public function loadProfile(int $userId): ?AuthUser;

    public function assignRoleByCode(int $userId, string $roleCode): void;

    public function syncIdentity(
        int $userId,
        string $provider,
        ?string $providerUid,
        string $providerEmail,
        array $providerData = [],
        ?string $verifiedAt = null
    ): AuthIdentity;

    public function findIdentityByProvider(string $provider, string $providerUid): ?AuthIdentity;

    public function markEmailAsVerified(int $userId): bool;

    public function updateUsername(int $userId, string $username): AuthUser;

    public function updateProfile(int $userId, string $firstName, string $lastName, string $username): AuthUser;

    public function updateProfilePhoto(int $userId, ?string $profilePhoto): AuthUser;

    public function updateProfilePhotoIfCurrentValue(
        int $userId,
        ?string $expectedCurrentPhoto,
        string $profilePhoto
    ): ?AuthUser;

    public function updatePasswordHash(int $userId, string $passwordHash): void;

    public function updateLastAccess(int $userId, ?string $lastAccessAt = null): void;

    public function updateTwoFactorSecret(int $userId, ?string $secret, ?array $recoveryCodes = null): void;

    public function confirmTwoFactor(int $userId): void;
}
