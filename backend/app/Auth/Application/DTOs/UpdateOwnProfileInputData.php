<?php

namespace App\Auth\Application\DTOs;

final class UpdateOwnProfileInputData
{
    public function __construct(
        public readonly int $userId,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $username
    ) {}
}
