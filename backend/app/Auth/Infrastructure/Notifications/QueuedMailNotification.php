<?php

declare(strict_types=1);

namespace App\Auth\Infrastructure\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Throwable;

abstract class QueuedMailNotification extends Notification implements ShouldQueueAfterCommit
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 12;

    public int $maxExceptions = 3;

    /**
     * @return array<int, int>
     */
    public function backoff(): array
    {
        return [3, 10];
    }

    public function failed(Throwable $exception): void
    {
        Log::error('Fallo definitivo al enviar una notificacion por correo.', [
            'notification' => static::class,
            'error' => $exception->getMessage(),
        ]);
    }
}
