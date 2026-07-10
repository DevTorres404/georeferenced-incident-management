<?php

namespace App\Auth\Application\DTOs;

final class ResetPasswordWithCodeInputData
{
    public function __construct(
        public readonly string $email,
        public readonly string $code,
        public readonly string $password
    ) {
    }
}
