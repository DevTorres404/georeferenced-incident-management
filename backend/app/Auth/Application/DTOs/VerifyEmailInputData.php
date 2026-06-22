<?php

namespace App\Auth\Application\DTOs;

final class VerifyEmailInputData
{
    public function __construct(
        public readonly int $userId,
        public readonly string $hash
    ) {
    }
}
