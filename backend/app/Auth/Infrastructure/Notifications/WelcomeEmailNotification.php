<?php

declare(strict_types=1);

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Lang;

class WelcomeEmailNotification extends QueuedMailNotification
{
    public function via(mixed $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(mixed $notifiable): MailMessage
    {
        $dashboardUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5500'), '/');

        return (new MailMessage)
            ->subject(Lang::get('Bienvenido a SGI'))
            ->view('emails.sgi-email', [
                'subject' => 'Bienvenido a SGI',
                'eyebrow' => 'Cuenta activada',
                'title' => 'Bienvenido a SGI',
                'displayName' => $notifiable->first_name
                    ?? $notifiable->name
                    ?? $notifiable->username
                    ?? 'Usuario',
                'intro' => 'Tu cuenta está lista para registrar, consultar y dar seguimiento a incidencias desde una plataforma segura.',
                'items' => [
                    'Accede con tu cuenta registrada.',
                    'Revisa las acciones disponibles para tu rol.',
                    'Crea, consulta o da seguimiento a las incidencias autorizadas.',
                ],
                'actionLabel' => 'Entrar a SGI',
                'actionUrl' => $dashboardUrl,
                'notice' => 'Por seguridad, ingresa siempre desde el enlace oficial de SGI y mantén actualizados tus datos de perfil.',
            ]);
    }
}
