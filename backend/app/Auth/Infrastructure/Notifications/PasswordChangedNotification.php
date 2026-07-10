<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordChangedNotification extends Notification
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
            ->subject('Tu contrasena fue actualizada')
            ->greeting('Hola '.$notifiable->first_name)
            ->line('Te informamos que la contrasena de tu cuenta SGI fue cambiada correctamente.')
            ->line('Si realizaste este cambio, no necesitas hacer nada mas.')
            ->line('Si no reconoces esta actividad, usa el flujo de recuperacion de contrasena o contacta al administrador.');
    }
}
