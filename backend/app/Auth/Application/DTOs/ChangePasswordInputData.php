<?php

namespace App\Auth\Application\DTOs;

final class ChangePasswordInputData
{
    public function __construct(
        public readonly int $userId,
        public readonly ?int $currentTokenId,
        public readonly string $currentPassword,
        public readonly string $newPassword
    ) {}
}
