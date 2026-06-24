<?php

namespace App\Auth\Domain\Entities;

use JsonSerializable;

final class AuthUser implements JsonSerializable
{
    /**
     * @param array<int, string> $roleCodes
     * @param array<int, string> $permissionCodes
     * @param array<int, AuthIdentity> $identities
     */
    public function __construct(
        public readonly ?int $id,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly ?string $username,
        public readonly string $email,
        public readonly ?string $passwordHash,
        public readonly ?string $phone,
        public readonly ?string $profilePhoto,
        public readonly bool $isActive,
        public readonly ?string $emailVerifiedAt,
        public readonly ?string $lastAccessAt,
        public readonly ?string $twoFactorSecret = null,
        public readonly ?string $twoFactorConfirmedAt = null,
        public readonly array $roleCodes = [],
        public readonly array $permissionCodes = [],
        public readonly array $identities = []
    ) {
    }

    public function hasVerifiedEmail(): bool
    {
        return $this->emailVerifiedAt !== null;
    }

    public function isTwoFactorEnabled(): bool
    {
        return $this->twoFactorSecret !== null && $this->twoFactorConfirmedAt !== null;
    }

    public function emailVerificationHash(): string
    {
        return sha1($this->email);
    }

    public function isGoogleLinkedToAnotherUser(?AuthIdentity $identity): bool
    {
        return $identity !== null
            && $identity->userId !== null
            && $this->id !== null
            && $identity->userId !== $this->id;
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'nombre' => $this->firstName,
            'apellido' => $this->lastName,
            'username' => $this->username,
            'email' => $this->email,
            'telefono' => $this->phone,
            'foto_perfil' => $this->profilePhoto,
            'activo' => $this->isActive,
            'email_verificado_at' => $this->emailVerifiedAt,
            'ultimo_acceso' => $this->lastAccessAt,
            'two_factor_enabled' => $this->isTwoFactorEnabled(),
            'roles' => array_map(
                static fn (string $roleCode) => ['codigo' => $roleCode],
                $this->roleCodes
            ),
            'permissions' => array_map(
                static fn (string $permissionCode) => ['codigo' => $permissionCode],
                $this->permissionCodes
            ),
            'identities' => $this->identities,
        ];
    }
}
