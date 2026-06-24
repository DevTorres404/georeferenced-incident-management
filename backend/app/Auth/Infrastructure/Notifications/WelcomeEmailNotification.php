<?php

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Lang;

class WelcomeEmailNotification extends Notification
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
     * @return \Illuminate\Notifications\Messages\MailMessage
     */
    public function toMail($notifiable)
    {
        $dashboardUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5500'), '/');

        return (new MailMessage)
            ->subject(Lang::get('Bienvenido a GIC'))
            ->view('emails.welcome-email', [
                'url' => $dashboardUrl,
                'notifiable' => $notifiable
            ]);
    }
}
