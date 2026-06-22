<?php

namespace App\Shared\Application\Ports;

interface LoggerPort
{
    public function error(string $message, array $context = []): void;
}
