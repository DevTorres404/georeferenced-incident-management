<?php

namespace App\Auth\Application\Ports;

interface UserNotificationPort
{
    public function sendVerificationEmail(int $userId): void;

    public function sendWelcomeEmail(int $userId): void;
}
