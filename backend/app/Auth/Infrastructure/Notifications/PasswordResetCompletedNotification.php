<?php

declare(strict_types=1);

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

class PasswordResetCompletedNotification extends QueuedMailNotification
{
    /**
     * @return array<int, string>
     */
    public function via(mixed $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(mixed $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('SGI | Contraseña restablecida')
            ->view('emails.sgi-email', [
                'subject' => 'SGI | Contraseña restablecida',
                'eyebrow' => 'Seguridad de la cuenta',
                'title' => 'Contraseña restablecida',
                'displayName' => $notifiable->first_name ?? 'Usuario',
                'intro' => 'La contraseña de tu cuenta SGI fue restablecida correctamente.',
                'lines' => [
                    'Por seguridad, cerramos tus sesiones anteriores.',
                ],
                'notice' => 'Si no realizaste este cambio, contacta al administrador de inmediato.',
            ]);
    }
}
