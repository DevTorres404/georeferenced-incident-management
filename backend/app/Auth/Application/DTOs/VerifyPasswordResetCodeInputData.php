<?php

namespace App\Auth\Application\DTOs;

final class VerifyPasswordResetCodeInputData
{
    public function __construct(
        public readonly string $email,
        public readonly string $code
    ) {
    }
}
