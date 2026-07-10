<?php

namespace App\Auth\Domain\Repositories;

use App\Auth\Domain\Entities\PasswordResetCode;

interface PasswordResetCodeRepositoryInterface
{
    public function store(string $email, string $codeHash, string $expiresAt): PasswordResetCode;

    public function findByEmail(string $email): ?PasswordResetCode;

    public function incrementAttempts(string $email): void;

    public function markUsed(string $email): void;

    public function deleteByEmail(string $email): void;
}
