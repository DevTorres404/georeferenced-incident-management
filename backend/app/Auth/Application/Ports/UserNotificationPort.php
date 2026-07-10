<?php

namespace App\Auth\Application\Ports;

interface UserNotificationPort
{
    public function sendVerificationEmail(int $userId): void;

    public function sendWelcomeEmail(int $userId): void;

    public function sendPasswordChangedEmail(int $userId): void;

    public function sendPasswordResetCodeEmail(int $userId, string $code, int $expiresInMinutes): void;

    public function sendPasswordResetCompletedEmail(int $userId): void;
}
