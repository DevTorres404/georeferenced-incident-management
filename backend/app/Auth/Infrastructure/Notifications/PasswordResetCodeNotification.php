<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetCodeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $code,
        public readonly int $expiresInMinutes
    ) {}

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
            ->subject('SGI | Código de recuperación')
            ->view('emails.sgi-email', [
                'subject' => 'SGI | Código de recuperación',
                'eyebrow' => 'Recuperación de acceso',
                'title' => 'Recupera tu acceso',
                'displayName' => $notifiable->first_name ?? 'Usuario',
                'intro' => 'Recibimos una solicitud para restablecer la contraseña de tu cuenta SGI.',
                'code' => $this->code,
                'codeLabel' => 'Código de recuperación',
                'lines' => [
                    'Este código expira en '.$this->expiresInMinutes.' minutos.',
                ],
                'notice' => 'Si no solicitaste este cambio, puedes ignorar este correo. No compartas el código con nadie.',
            ]);
    }
}
