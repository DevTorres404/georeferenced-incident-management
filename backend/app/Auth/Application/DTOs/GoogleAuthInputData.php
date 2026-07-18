<?php

namespace App\Auth\Application\DTOs;

final class GoogleAuthInputData
{
    public function __construct(
        public readonly string $intent,
        public readonly string $idToken,
        public readonly string $ip,
        public readonly ?string $userAgent
    ) {}
}
