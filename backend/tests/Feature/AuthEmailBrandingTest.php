<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Notifications\PasswordChangedNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCodeNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCompletedNotification;
use App\Auth\Infrastructure\Notifications\VerifyEmailNotification;
use App\Auth\Infrastructure\Notifications\WelcomeEmailNotification;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Notifications\Notification;
use Tests\TestCase;

class AuthEmailBrandingTest extends TestCase
{
    public function test_auth_emails_use_the_sgi_brand_and_current_palette(): void
    {
        $user = (new User)->forceFill([
            'id' => 1,
            'first_name' => 'Ana',
            'last_name' => 'Torres',
            'email' => 'ana@example.com',
        ]);

        $notifications = [
            new VerifyEmailNotification,
            new WelcomeEmailNotification,
            new PasswordChangedNotification,
            new PasswordResetCodeNotification('482731', 15),
            new PasswordResetCompletedNotification,
        ];

        foreach ($notifications as $notification) {
            $this->assertInstanceOf(ShouldQueue::class, $notification);
            $this->assertSgiBranding($notification, $user);
        }
    }

    public function test_auth_emails_use_a_short_bounded_retry_policy(): void
    {
        $notifications = [
            new VerifyEmailNotification,
            new WelcomeEmailNotification,
            new PasswordChangedNotification,
            new PasswordResetCodeNotification('482731', 15),
            new PasswordResetCompletedNotification,
        ];

        foreach ($notifications as $notification) {
            $this->assertInstanceOf(ShouldQueueAfterCommit::class, $notification);
            $this->assertSame(3, $notification->tries);
            $this->assertSame(12, $notification->timeout);
            $this->assertSame(3, $notification->maxExceptions);
            $this->assertSame([3, 10], $notification->backoff());
        }

        $this->assertSame(8.0, config('mail.mailers.smtp.timeout'));
        $this->assertSame(150, config('queue.connections.redis.retry_after'));
    }

    private function assertSgiBranding(Notification $notification, User $user): void
    {
        $mail = $notification->toMail($user);
        $html = $mail->render();

        $this->assertSame('emails.sgi-email', $mail->view);
        $this->assertStringContainsString('SGI', $mail->subject);
        $this->assertStringContainsString('Sistema de Gestión de Incidencias', $html);
        $this->assertStringContainsString('#1f8edb', $html);
        $this->assertStringContainsString('#15629c', $html);
        $this->assertStringContainsString('#060a12', $html);
    }
}
