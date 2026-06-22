<?php

namespace App\Auth\Application\DTOs;

final class RegisterUserInputData
{
    public function __construct(
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $username,
        public readonly string $email,
        public readonly string $password,
        public readonly ?string $phone
    ) {
    }
}
