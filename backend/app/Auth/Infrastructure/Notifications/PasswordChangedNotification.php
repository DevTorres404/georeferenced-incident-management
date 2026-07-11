<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordChangedNotification extends Notification implements ShouldQueue
{
    use Queueable;

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
            ->subject('SGI | Contraseña actualizada')
            ->view('emails.sgi-email', [
                'subject' => 'SGI | Contraseña actualizada',
                'eyebrow' => 'Seguridad de la cuenta',
                'title' => 'Contraseña actualizada',
                'displayName' => $notifiable->first_name ?? 'Usuario',
                'intro' => 'La contraseña de tu cuenta SGI fue actualizada correctamente.',
                'lines' => [
                    'Si realizaste este cambio, no necesitas hacer nada más.',
                ],
                'notice' => 'Si no reconoces esta actividad, recupera tu contraseña o contacta al administrador de inmediato.',
            ]);
    }
}
