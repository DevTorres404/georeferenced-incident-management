<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetCompletedNotification extends Notification
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
        return (new MailMessage())
            ->subject('Tu contrasena fue restablecida')
            ->greeting('Hola '.$notifiable->first_name)
            ->line('La contrasena de tu cuenta SGI fue restablecida correctamente.')
            ->line('Por seguridad, cerramos tus sesiones anteriores.')
            ->line('Si no realizaste este cambio, contacta al administrador de inmediato.');
    }
}
