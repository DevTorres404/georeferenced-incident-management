<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

class VerifyEmailNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            Carbon::now()->addMinutes(60 * 24),
            [
                'id' => $notifiable->getKey(),
                'hash' => sha1($notifiable->getEmailForVerification()),
            ]
        );

        return (new MailMessage)
            ->subject('SGI | Verifica tu correo')
            ->view('emails.sgi-email', [
                'subject' => 'SGI | Verifica tu correo',
                'eyebrow' => 'Activación de cuenta',
                'title' => 'Verifica tu correo',
                'displayName' => $notifiable->first_name ?? 'Usuario',
                'intro' => 'Confirma tu correo electrónico para activar tu cuenta en SGI.',
                'actionLabel' => 'Verificar correo',
                'actionUrl' => $verificationUrl,
                'notice' => 'Si no creaste esta cuenta, puedes ignorar este mensaje de forma segura.',
            ]);
    }
}
