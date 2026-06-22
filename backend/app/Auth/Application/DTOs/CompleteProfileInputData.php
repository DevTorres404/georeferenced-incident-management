<?php

namespace App\Auth\Application\DTOs;

final class CompleteProfileInputData
{
    public function __construct(
        public readonly int $userId,
        public readonly string $username
    ) {
    }
}
