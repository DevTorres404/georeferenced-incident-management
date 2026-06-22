<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Infrastructure\Notifications\VerifyEmailNotification;
use App\Auth\Infrastructure\Notifications\WelcomeEmailNotification;
use App\Auth\Infrastructure\Persistence\Models\User;

final class LaravelUserNotificationAdapter implements UserNotificationPort
{
    public function sendVerificationEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new VerifyEmailNotification());
    }

    public function sendWelcomeEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new WelcomeEmailNotification());
    }
}
