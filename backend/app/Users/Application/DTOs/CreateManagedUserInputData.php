<?php

namespace App\Users\Application\DTOs;

final class CreateManagedUserInputData
{
    /**
     * @param  array<int, string>  $roleCodes
     */
    public function __construct(
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly ?string $username,
        public readonly string $email,
        public readonly string $password,
        public readonly ?string $phone,
        public readonly ?string $profilePhoto,
        public readonly bool $isActive = true,
        public readonly array $roleCodes = ['CIUDADANO'],
        public readonly ?int $assignedBy = null
    ) {}
}
