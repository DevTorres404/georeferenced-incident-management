<?php

namespace App\Users\Application\DTOs;

final class UpdateManagedUserInputData
{
    /**
     * @param  array<int, string>|null  $roleCodes
     */
    public function __construct(
        public readonly ?string $firstName = null,
        public readonly ?string $lastName = null,
        public readonly ?string $username = null,
        public readonly ?string $email = null,
        public readonly ?string $password = null,
        public readonly ?string $phone = null,
        public readonly ?string $profilePhoto = null,
        public readonly ?bool $isActive = null,
        public readonly ?array $roleCodes = null,
        public readonly ?int $assignedBy = null
    ) {}
}
