<?php

namespace App\Auth\Application\Ports;

interface PasswordHasherPort
{
    public function verify(string $plainValue, ?string $hashedValue): bool;

    public function make(string $plainValue): string;
}
