<?php

namespace App\Auth\Application\DTOs;

final class ForgotPasswordInputData
{
    public function __construct(
        public readonly string $email
    ) {
    }
}
