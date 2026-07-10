<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetCodeNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $code,
        public readonly int $expiresInMinutes
    ) {
    }

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
            ->subject('Codigo de recuperacion de contrasena')
            ->greeting('Hola '.$notifiable->first_name)
            ->line('Recibimos una solicitud para restablecer la contrasena de tu cuenta SGI.')
            ->line('Tu codigo de recuperacion es: '.$this->code)
            ->line('Este codigo expira en '.$this->expiresInMinutes.' minutos.')
            ->line('Si no solicitaste este cambio, puedes ignorar este correo.');
    }
}
