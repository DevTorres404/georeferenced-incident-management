<?php

namespace App\Auth\Domain\Repositories;

interface LoginAttemptRepositoryInterface
{
    /**
     * Registrar un intento de acceso en la base de datos de auditoría.
     */
    public function logAttempt(
        string $email,
        ?int $userId,
        bool $successful,
        ?string $failReason,
        string $ip,
        ?string $userAgent
    ): void;
}
