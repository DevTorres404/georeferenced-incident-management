<?php

namespace App\Audit\Application\DTOs;

final class LoginAttemptFiltersData
{
    public function __construct(
        public readonly ?string $email = null,
        public readonly ?bool $successful = null,
        public readonly ?string $ipAddress = null,
        public readonly int $perPage = 25
    ) {}
}
