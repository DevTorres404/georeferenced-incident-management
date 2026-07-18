<?php

namespace App\Auth\Application\DTOs;

final class CreateUserInputData
{
    public function __construct(
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly ?string $username,
        public readonly string $email,
        public readonly string $password,
        public readonly ?string $phone = null,
        public readonly ?string $profilePhoto = null,
        public readonly ?string $emailVerifiedAt = null,
        public readonly bool $isActive = true
    ) {}
}
