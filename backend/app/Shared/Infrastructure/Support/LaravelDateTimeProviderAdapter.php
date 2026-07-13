<?php

namespace App\Shared\Infrastructure\Support;

use App\Shared\Application\Ports\DateTimeProviderPort;
use Illuminate\Support\Carbon;

final class LaravelDateTimeProviderAdapter implements DateTimeProviderPort
{
    public function now(): Carbon
    {
        return now();
    }

    public function nowIso8601(): string
    {
        return now()->toIso8601String();
    }
}
