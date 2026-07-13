<?php

namespace App\Shared\Application\Ports;

use Illuminate\Support\Carbon;

interface DateTimeProviderPort
{
    /**
     * Get the current date and time as a Carbon instance.
     */
    public function now(): Carbon;

    /**
     * Get the current date and time as an ISO 8601 string.
     */
    public function nowIso8601(): string;
}
