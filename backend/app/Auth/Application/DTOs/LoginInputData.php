<?php

namespace App\Auth\Application\DTOs;

final class LoginInputData
{
    public function __construct(
        public readonly string $email,
        public readonly string $password,
        public readonly string $ip,
        public readonly ?string $userAgent
    ) {
    }
}
