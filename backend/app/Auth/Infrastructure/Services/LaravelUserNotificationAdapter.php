<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Infrastructure\Notifications\PasswordChangedNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCodeNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCompletedNotification;
use App\Auth\Infrastructure\Notifications\VerifyEmailNotification;
use App\Auth\Infrastructure\Notifications\WelcomeEmailNotification;
use App\Auth\Infrastructure\Persistence\Models\User;

final class LaravelUserNotificationAdapter implements UserNotificationPort
{
    public function sendVerificationEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new VerifyEmailNotification);
    }

    public function sendWelcomeEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new WelcomeEmailNotification);
    }

    public function sendPasswordChangedEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new PasswordChangedNotification);
    }

    public function sendPasswordResetCodeEmail(int $userId, string $code, int $expiresInMinutes): void
    {
        User::findOrFail($userId)->notify(new PasswordResetCodeNotification($code, $expiresInMinutes));
    }

    public function sendPasswordResetCompletedEmail(int $userId): void
    {
        User::findOrFail($userId)->notify(new PasswordResetCompletedNotification);
    }
}
