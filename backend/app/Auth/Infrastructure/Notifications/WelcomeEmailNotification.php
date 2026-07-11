<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;

class WelcomeEmailNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * Get the notification's delivery channels.
     *
     * @param  mixed  $notifiable
     * @return array
     */
    public function via($notifiable)
    {
        return ['mail'];
    }

    /**
     * Build the mail representation of the notification.
     *
     * @param  mixed  $notifiable
     * @return MailMessage
     */
    public function toMail($notifiable)
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
