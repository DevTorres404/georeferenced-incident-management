<?php

namespace App\Shared\Infrastructure\Support;

use App\Shared\Application\Ports\LoggerPort;
use Illuminate\Support\Facades\Log;

final class LaravelLoggerAdapter implements LoggerPort
{
    public function error(string $message, array $context = []): void
    {
        Log::error($message, $context);
    }
}
